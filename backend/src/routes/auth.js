import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { EMAIL_RE, normalizeEmail } from '../utils/validate.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const errors = {};
    if (!name) errors.name = 'Name is required';
    else if (name.length > 80) errors.name = 'Name must be at most 80 characters';
    if (!EMAIL_RE.test(email)) errors.email = 'A valid email is required';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (password.length > 128) errors.password = 'Password must be at most 128 characters';
    if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', { fields: errors });

    if (await User.exists({ email })) {
      throw new HttpError(409, 'An account with this email already exists', { fields: { email: 'Email already registered' } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await User.create({ name, email, passwordHash });
    } catch (err) {
      if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
      throw err;
    }
    res.status(201).json({ token: signToken(user), user: user.toPublic() });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) throw new HttpError(400, 'Email and password are required');
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw new HttpError(401, 'Invalid email or password');
    res.json({ token: signToken(user), user: user.toPublic() });
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

export default router;
