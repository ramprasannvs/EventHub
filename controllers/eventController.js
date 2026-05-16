const Event = require('../models/Event');

// Validation helpers
const validateEventData = (data) => {
    const errors = [];

    if (!data.title || data.title.trim().length < 3) {
        errors.push('Title must be at least 3 characters long');
    }

    if (!data.description || data.description.trim().length < 10) {
        errors.push('Description must be at least 10 characters long');
    }

    if (!data.date) {
        errors.push('Event date is required');
    } else {
        const eventDate = new Date(data.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (eventDate < today) {
            errors.push('Event date cannot be in the past');
        }
    }

    if (!data.location || data.location.trim().length < 3) {
        errors.push('Location must be at least 3 characters long');
    }

    if (!data.category || data.category.trim().length < 2) {
        errors.push('Category is required');
    }

    if (!data.totalSeats || data.totalSeats < 1) {
        errors.push('Total seats must be at least 1');
    }

    if (data.ticketPrice !== undefined && data.ticketPrice < 0) {
        errors.push('Ticket price cannot be negative');
    }

    return errors;
};

// @desc    Get all events
// @route   GET /api/events
// @access  Public
exports.getEvents = async (req, res) => {
    try {
        const filters = {};

        // Filter out past events (only show upcoming events)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filters.date = { $gte: today };

        // Category filter
        if (req.query.category) {
            filters.category = { $regex: req.query.category, $options: 'i' };
        }

        // Search filter (title or description)
        if (req.query.search) {
            filters.$or = [
                { title: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Get events
        const events = await Event.find(filters)
            .populate('createdBy', 'name email')
            .sort({ date: 1 }); // Sort by date ascending

        res.json(events);
    } catch (error) {
        console.error('Get Events Error:', error);
        res.status(500).json({ message: 'Server error fetching events', error: error.message });
    }
};

// @desc    Get single event by ID
// @route   GET /api/events/:id
// @access  Public
exports.getEventById = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        res.json(event);
    } catch (error) {
        console.error('Get Event By ID Error:', error);

        // Handle invalid ObjectId
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Event not found' });
        }

        res.status(500).json({ message: 'Server error fetching event', error: error.message });
    }
};

// @desc    Create new event
// @route   POST /api/events
// @access  Private/Admin
exports.createEvent = async (req, res) => {
    try {
        const { title, description, date, location, category, totalSeats, ticketPrice, image } = req.body;

        // Validate input
        const validationErrors = validateEventData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Create event
        const event = await Event.create({
            title: title.trim(),
            description: description.trim(),
            date: new Date(date),
            location: location.trim(),
            category: category.trim(),
            totalSeats: parseInt(totalSeats),
            availableSeats: parseInt(totalSeats),
            ticketPrice: ticketPrice ? parseFloat(ticketPrice) : 0,
            image: image ? image.trim() : '',
            createdBy: req.user.id
        });

        // Populate creator info
        const populatedEvent = await Event.findById(event._id)
            .populate('createdBy', 'name email');

        res.status(201).json({
            message: 'Event created successfully',
            event: populatedEvent
        });
    } catch (error) {
        console.error('Create Event Error:', error);
        res.status(500).json({ message: 'Server error creating event', error: error.message });
    }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private/Admin
exports.updateEvent = async (req, res) => {
    try {
        // Find event
        let event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check authorization (only creator or admin can update)
        if (event.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to update this event' });
        }

        // Validate if data is provided
        if (req.body.title || req.body.description || req.body.date ||
            req.body.location || req.body.category || req.body.totalSeats) {

            const dataToValidate = {
                title: req.body.title || event.title,
                description: req.body.description || event.description,
                date: req.body.date || event.date,
                location: req.body.location || event.location,
                category: req.body.category || event.category,
                totalSeats: req.body.totalSeats || event.totalSeats,
                ticketPrice: req.body.ticketPrice !== undefined ? req.body.ticketPrice : event.ticketPrice
            };

            const validationErrors = validateEventData(dataToValidate);
            if (validationErrors.length > 0) {
                return res.status(400).json({
                    message: 'Validation failed',
                    errors: validationErrors
                });
            }
        }

        // If totalSeats is being updated, adjust availableSeats proportionally
        if (req.body.totalSeats && req.body.totalSeats !== event.totalSeats) {
            const bookedSeats = event.totalSeats - event.availableSeats;
            const newTotalSeats = parseInt(req.body.totalSeats);

            if (newTotalSeats < bookedSeats) {
                return res.status(400).json({
                    message: `Cannot reduce total seats below ${bookedSeats} (already booked)`
                });
            }

            req.body.availableSeats = newTotalSeats - bookedSeats;
        }

        // Update event
        event = await Event.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        res.json({
            message: 'Event updated successfully',
            event
        });
    } catch (error) {
        console.error('Update Event Error:', error);

        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Event not found' });
        }

        res.status(500).json({ message: 'Server error updating event', error: error.message });
    }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private/Admin
exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check authorization (only creator or admin can delete)
        if (event.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this event' });
        }

        // Check if event has bookings
        const Booking = require('../models/Booking');
        const bookingsCount = await Booking.countDocuments({
            eventId: req.params.id,
            status: { $in: ['pending', 'confirmed'] }
        });

        if (bookingsCount > 0) {
            return res.status(400).json({
                message: `Cannot delete event with ${bookingsCount} active booking(s). Please cancel bookings first.`
            });
        }

        await Event.findByIdAndDelete(req.params.id);

        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Delete Event Error:', error);

        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Event not found' });
        }

        res.status(500).json({ message: 'Server error deleting event', error: error.message });
    }
};
