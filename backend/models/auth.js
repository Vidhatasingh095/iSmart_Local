const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('./User');
const sendEmail = require('../utils/sendEmail');

const client = new OAuth2Client("486216064813-qr8cflm6racj1pku2lqldfpogedp4h5d.apps.googleusercontent.com");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

// OTP Store (Temporary memory) - Ye server restart hone par reset ho jayega
let otpStore = {};

// 1. Send OTP Route
router.post('/send-otp', async (req, res) => {
    const { mobile } = req.body;

    // Backend Validation
    const indianMobileRegex = /^[6-9]\d{9}$/;
    if (!mobile || !indianMobileRegex.test(mobile)) {
        return res.status(400).json({ msg: "Invalid Indian Mobile Number!" });
    }
    // 6 Digit OTP generate karein
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[mobile] = otp;

    console.log(`\n📩 [OTP] Mobile: ${mobile} | OTP: ${otp}\n`); // Terminal mein check karein
    res.status(200).json({ msg: "OTP Sent Successfully!", otp }); // Testing ke liye OTP bhej rahe hain
});

// 2. Signup Route (Email Verification)
router.post('/signup', async (req, res) => {
    try {
        const { name, email, mobile, role, password } = req.body;

        // Basic validation
        if (!name || !email || !password) {
            return res.status(400).json({ msg: "Please provide name, email and password." });
        }

        // Email check
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: "User already exists" });

        const normEmail = String(email).toLowerCase().trim();
        const inputRole = (role || '').toLowerCase();
        let finalRole = 'student';
        if (inputRole === 'driver') finalRole = 'driver';
        else if (inputRole === 'admin' && normEmail === ADMIN_EMAIL) finalRole = 'admin';

        // Set password
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        const doc = {
            name: String(name).trim(),
            email: normEmail,
            mobile,
            isVerified: true,
            password: hashed,
            role: finalRole
        };
        user = new User(doc);

        await user.save();

        const token = jwt.sign({ id: user._id, role: user.role }, "secret_key", { expiresIn: '1h' });
        res.status(201).json({ 
            msg: "User registered successfully.", 
            token, 
            user: { id: user._id, name: user.name, email: user.email, role: user.role } 
        });

    } catch (err) {
        console.error('Signup Error:', err);
        if (err && err.code === 11000) {
            return res.status(400).json({ msg: "User already exists" });
        }
        if (err && err.name === 'ValidationError') {
            return res.status(400).json({ msg: "Please provide valid data" });
        }
        res.status(500).json({ msg: "Server Error during signup" });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            // To prevent email enumeration, send a generic success message even if the user doesn't exist.
            return res.status(200).json({ msg: 'If a user with this email exists, a password reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        user.resetPasswordToken = await bcrypt.hash(resetToken, salt);
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `${process.env.BASE_URL}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;
        const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please click on the following link, or paste this into your browser to complete the process within one hour: \n\n ${resetUrl}`;

        await sendEmail(user.email, 'Password Reset', message);

        res.status(200).json({ msg: 'Password reset link sent successfully.' });
    } catch (err) {
        console.error('Forgot Password Error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

router.get('/verify-email', async (req, res) => {
    try {
        const { token, email } = req.query;
        const user = await User.findOne({ email });

        if (!user || !user.verificationToken) {
            return res.status(400).send('Invalid or expired verification link.');
        }

        const isMatch = await bcrypt.compare(token, user.verificationToken);
        if (!isMatch) {
            return res.status(400).send('Invalid verification link.');
        }

        user.isVerified = true;
        user.verificationToken = undefined; // Clear the token
        await user.save();

        // Redirect to a page where the user can set their password
        res.redirect(`/set-password.html?email=${encodeURIComponent(email)}`);

    } catch (err) {
        console.error('Email Verification Error:', err);
        res.status(500).send('Server error during email verification.');
    }
});

// Set Password (after email verification or for password reset)
router.post('/set-password', async (req, res) => {
    try {
        const { email, newPassword, token } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: "User not found." });
        }

        // Case 1: Resetting password with a token
        if (token) {
            if (!user.resetPasswordToken || !user.resetPasswordExpires) {
                return res.status(400).json({ msg: 'Invalid password reset request.' });
            }
            if (Date.now() > user.resetPasswordExpires) {
                return res.status(400).json({ msg: 'Password reset token has expired.' });
            }
            const isMatch = await bcrypt.compare(token, user.resetPasswordToken);
            if (!isMatch) {
                return res.status(400).json({ msg: 'Invalid password reset token.' });
            }
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
        }
        // Case 2: Setting password for the first time after email verification (no token needed)
        else if (!user.isVerified) {
             return res.status(400).json({ msg: 'Email not verified. Cannot set password.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ msg: "Password set successfully." });

    } catch (err) {
        console.error('Set Password Error:', err);
        res.status(500).json({ msg: "Server error while setting password." });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "User not found" });

        if (!user.password) {
            return res.status(400).json({ msg: "Please sign in with Google or set a password for your account." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Wrong password" });

        // Restrict admin access to configured admin email only
        if (user.role === 'admin' && email.toLowerCase() !== ADMIN_EMAIL) {
            return res.status(403).json({ msg: "Admin access restricted" });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, "secret_key", { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ msg: "Login Error" });
    }
});

// Mobile OTP based Password Reset
router.post('/reset-password-mobile', async (req, res) => {
    try {
        const { mobile, otp, newPassword } = req.body;

        if (!otpStore[mobile] || otpStore[mobile] != otp) {
            return res.status(400).json({ msg: "Invalid or Expired OTP" });
        }

        let user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ msg: "User not found with this mobile number" });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        delete otpStore[mobile];
        res.status(200).json({ msg: "Password Reset Successfully! Now you can Login." });

    } catch (err) {
        console.error('Mobile Reset Password Error:', err);
        res.status(500).json({ msg: "Server Error" });
    }
});

// Google Sign-In
router.post('/google-signin', async (req, res) => {
    const { token } = req.body;
    try {
        console.log('Google Sign-In: Starting verification for token of length:', token?.length || 0);
        
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: "486216064813-qr8cflm6racj1pku2lqldfpogedp4h5d.apps.googleusercontent.com",
        });
        
        const payload = ticket.getPayload();
        console.log('Google Sign-In: Token verified successfully! Payload:', {
            name: payload.name,
            email: payload.email,
            sub: payload.sub
        });
        
        const { name, email, sub } = payload;

        let user = await User.findOne({ email });
        if (!user) {
            console.log('Google Sign-In: Creating new user for:', email);
            user = new User({
                name,
                email,
                googleId: sub,
                isVerified: true, // Google users are considered verified
                role: (email.toLowerCase() === ADMIN_EMAIL) ? 'admin' : 'student'
            });
            await user.save();
        } else {
            console.log('Google Sign-In: Found existing user for:', email);
            // Enforce admin role only for configured email
            if (email.toLowerCase() === ADMIN_EMAIL && user.role !== 'admin') {
                user.role = 'admin';
                await user.save();
            }
            if (email.toLowerCase() !== ADMIN_EMAIL && user.role === 'admin') {
                user.role = 'student';
                await user.save();
            }
        }

        const jwtToken = jwt.sign({ id: user._id, role: user.role }, "secret_key", { expiresIn: '1h' });
        console.log('Google Sign-In: JWT generated, sending response');
        res.status(200).json({
            msg: 'Signed in successfully',
            token: jwtToken,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('Google Sign-In Error Details:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        res.status(400).json({ 
            msg: 'Invalid Google token',
            error: error.message 
        });
    }
});

module.exports = router;
