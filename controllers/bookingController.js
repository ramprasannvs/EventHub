const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// @desc    Send OTP for booking verification
// @route   POST /api/bookings/send-otp
// @access  Private
exports.sendBookingOTP = async (req, res) => {
    try {
        if (!req.user || !req.user.email) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Generate OTP
        const otp = generateOTP();

        // Delete any existing booking OTP for this user
        await OTP.deleteMany({ email: req.user.email, action: 'event_booking' });

        // Create new OTP
        await OTP.create({
            email: req.user.email,
            otp,
            action: 'event_booking'
        });

        // Send OTP email
        await sendOTPEmail(req.user.email, otp, 'event_booking');

        res.json({ message: 'OTP sent successfully to your email' });
    } catch (error) {
        console.error('Send Booking OTP Error:', error);
        res.status(500).json({ message: 'Error sending OTP', error: error.message });
    }
};

// @desc    Book an event
// @route   POST /api/bookings
// @access  Private
exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body;

        // Validation
        if (!eventId) {
            return res.status(400).json({ message: 'Event ID is required' });
        }

        if (!otp) {
            return res.status(400).json({ message: 'OTP is required for booking' });
        }

        if (otp.length !== 6) {
            return res.status(400).json({ message: 'OTP must be 6 digits' });
        }

        // Verify OTP
        const validOTP = await OTP.findOne({
            email: req.user.email,
            otp: otp.trim(),
            action: 'event_booking'
        });

        if (!validOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Find event
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check if event date has passed
        if (new Date(event.date) < new Date()) {
            return res.status(400).json({ message: 'Cannot book past events' });
        }

        // Check seat availability
        if (event.availableSeats <= 0) {
            return res.status(400).json({ message: 'No seats available for this event' });
        }

        // Check for existing booking
        const existingBooking = await Booking.findOne({
            userId: req.user.id,
            eventId
        });

        if (existingBooking) {
            if (existingBooking.status === 'pending') {
                return res.status(400).json({ message: 'You already have a pending booking for this event' });
            }
            if (existingBooking.status === 'confirmed') {
                return res.status(400).json({ message: 'You have already booked this event' });
            }
        }

        // Create booking
        const booking = await Booking.create({
            userId: req.user.id,
            eventId,
            status: 'pending',
            paymentStatus: 'not_paid',
            amount: event.ticketPrice || 0,
            bookedAt: new Date()
        });

        // Delete OTP after successful booking
        await OTP.deleteOne({ _id: validOTP._id });

        // Populate booking data
        const populatedBooking = await Booking.findById(booking._id)
            .populate('eventId', 'title date location')
            .populate('userId', 'name email');

        res.status(201).json({
            message: 'Booking request submitted successfully. Awaiting admin confirmation.',
            booking: populatedBooking
        });
    } catch (error) {
        console.error('Book Event Error:', error);
        res.status(500).json({ message: 'Server error during booking', error: error.message });
    }
};

// @desc    Confirm booking (Admin only)
// @route   PUT /api/bookings/:id/confirm
// @access  Private/Admin
exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body;

        // Validation
        if (!paymentStatus || !['paid', 'not_paid'].includes(paymentStatus)) {
            return res.status(400).json({ message: 'Valid payment status is required (paid or not_paid)' });
        }

        // Find booking
        const booking = await Booking.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('eventId', 'title date location availableSeats');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if already confirmed
        if (booking.status === 'confirmed') {
            return res.status(400).json({ message: 'Booking is already confirmed' });
        }

        // Check if cancelled
        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot confirm a cancelled booking' });
        }

        // Find event and check seat availability
        const event = await Event.findById(booking.eventId._id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        if (event.availableSeats <= 0) {
            return res.status(400).json({ message: 'No seats available to confirm this booking' });
        }

        // Update booking status
        booking.status = 'confirmed';
        booking.paymentStatus = paymentStatus;
        await booking.save();

        // Decrease available seats
        event.availableSeats -= 1;
        await event.save();

        // Send confirmation email
        try {
            await sendBookingEmail(
                booking.userId.email,
                booking.userId.name,
                booking.eventId.title
            );
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            message: 'Booking confirmed successfully',
            booking
        });
    } catch (error) {
        console.error('Confirm Booking Error:', error);
        res.status(500).json({ message: 'Server error during booking confirmation', error: error.message });
    }
};

// @desc    Get user bookings (or all bookings for admin)
// @route   GET /api/bookings/my
// @access  Private
exports.getMyBookings = async (req, res) => {
    try {
        let bookings;

        if (req.user.role === 'admin') {
            // Admin gets all bookings
            bookings = await Booking.find()
                .populate('eventId', 'title date location category totalSeats availableSeats')
                .populate('userId', 'name email')
                .sort({ createdAt: -1 });
        } else {
            // User gets only their bookings
            bookings = await Booking.find({ userId: req.user.id })
                .populate('eventId', 'title date location category totalSeats availableSeats')
                .sort({ createdAt: -1 });
        }

        res.json(bookings);
    } catch (error) {
        console.error('Get Bookings Error:', error);
        res.status(500).json({ message: 'Server error fetching bookings', error: error.message });
    }
};

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private
exports.cancelBooking = async (req, res) => {
    try {
        // Find booking
        const booking = await Booking.findById(req.params.id).populate('eventId', 'date title');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if event date has passed
        if (booking.eventId && new Date(booking.eventId.date) < new Date()) {
            return res.status(403).json({ 
                message: 'Cannot cancel booking for past events' 
            });
        }

        // Check authorization (user can cancel their own, admin can cancel any)
        if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to cancel this booking' });
        }

        // Check if already cancelled
        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Booking is already cancelled' });
        }

        // Store previous status
        const wasConfirmed = booking.status === 'confirmed';

        // Update booking status
        booking.status = 'cancelled';
        await booking.save();

        // If booking was confirmed, restore the seat
        if (wasConfirmed) {
            const event = await Event.findById(booking.eventId._id);
            if (event) {
                event.availableSeats += 1;
                await event.save();
            }
        }

        res.json({
            message: 'Booking cancelled successfully',
            seatRestored: wasConfirmed
        });
    } catch (error) {
        console.error('Cancel Booking Error:', error);
        res.status(500).json({ message: 'Server error during cancellation', error: error.message });
    }
};
