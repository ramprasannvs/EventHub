const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Generate JWT Token
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Validation helper
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        if (name.trim().length < 2) {
            return res.status(400).json({ message: 'Name must be at least 2 characters long' });
        }

        // Check if user already exists
        let user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            // If user is not verified, delete old data and allow re-registration
            if (!user.isVerified) {
                await User.deleteOne({ _id: user._id });
                await OTP.deleteMany({ email: email.toLowerCase() });
            } else {
                return res.status(400).json({ message: 'User already exists with this email' });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        user = await User.create({
            name: name.trim(),
            email: email.toLowerCase(),
            password: hashedPassword,
            role: 'user',
            isVerified: false
        });

        // Generate and send OTP
        const otp = generateOTP();

        // Delete any existing OTP for this email
        await OTP.deleteMany({ email: email.toLowerCase(), action: 'account_verification' });

        // Create new OTP
        await OTP.create({
            email: email.toLowerCase(),
            otp,
            action: 'account_verification'
        });

        // Send OTP email
        await sendOTPEmail(email, otp, 'account_verification');

        res.status(201).json({
            message: 'Registration successful! OTP sent to your email. Please verify to continue.',
            email: user.email
        });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Server error during registration', error: error.message });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Return user data with token
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login', error: error.message });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validation
        if (!email || !otp) {
            return res.status(400).json({ message: 'Please provide email and OTP' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        if (otp.length !== 6) {
            return res.status(400).json({ message: 'OTP must be 6 digits' });
        }

        // Find OTP
        const validOTP = await OTP.findOne({
            email: email.toLowerCase(),
            otp: otp.trim(),
            action: 'account_verification'
        });

        if (!validOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP. ' });
        }

        // Find and update user
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { isVerified: true },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete OTP after successful verification
        await OTP.deleteOne({ _id: validOTP._id });

        // Return user data with token
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server error during OTP verification', error: error.message });
    }
};
