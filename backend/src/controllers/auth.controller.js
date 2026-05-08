import userModel from "../models/user.model.js"
import jwt from "jsonwebtoken"

// ─────────────────────────────────────────────
// COOKIE CONFIG
// ─────────────────────────────────────────────

const BASE_COOKIE_OPTIONS = {
    httpOnly: true,                                         // JS cannot read this cookie (blocks XSS)
    secure: process.env.NODE_ENV === "production",          // HTTPS only in production
    sameSite: process.env.NODE_ENV === "production"         // "strict" in prod = blocks CSRF
        ? "strict"
        : "lax",
}

const ACCESS_TOKEN_COOKIE = {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000,                                 // 15 minutes
}

const REFRESH_TOKEN_COOKIE = {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,                       // 7 days
}

// Clear cookies on logout
const CLEAR_COOKIE = {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
}


// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

export async function register(req, res, next) {

    const { name, email, password } = req.body

    try {
        // 2. Check if email already exists
        const isExistEmail = await userModel.findOne({ email })
        if (isExistEmail) {
            return res.status(409).json({           // 409 Conflict is more accurate than 400
                success: false,
                message: "Email already registered"
            })
        }

        // 3. Create user (password hashing should be in pre-save hook in model)
        const user = await userModel.create({ name, email, password })

        // 4. Generate tokens BEFORE hiding password
        const accessToken = user.jwtToken()
        const refreshToken = user.refreshTokenGenerator()

        // 5. Save hashed refresh token in DB for rotation & revocation
        //    Store only the hash (never the raw token) — just like passwords
        user.refreshToken = refreshToken
        await user.save()

        // 6. Hide sensitive fields from response
        user.password = undefined
        user.refreshToken = undefined

        // 7. Set both tokens as httpOnly cookies
        res.cookie("accessToken", accessToken, ACCESS_TOKEN_COOKIE)
        res.cookie("refreshToken", refreshToken, REFRESH_TOKEN_COOKIE)

        return res.status(201).json({
            success: true,
            message: "Registered successfully",
            user,
        })

    } catch (error) {
        next(error)
    }
}


// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

export async function login(req, res, next) {
  

    const { email, password } = req.body

    try {
        // 2. Find user — select password field explicitly (it's hidden by default in model)
        const user = await userModel
            .findOne({ email })
            .select("+password +refreshToken")

        // 3. Use a GENERIC error message — never reveal which field is wrong
        //    "Email not found" tells a hacker which emails exist (user enumeration attack)
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"    // intentionally vague
            })
        }

        // 4. Compare password using bcrypt (should be a method on the model)
        const isPasswordCorrect = await user.comparePassword(password)
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"    // same message as above on purpose
            })
        }

        // 5. Generate fresh tokens on every login
        const accessToken = user.jwtToken()
        const refreshToken = user.refreshTokenGenerator()

        // 6. Save new refresh token in DB (overwrites old one — old sessions invalidated)
        user.refreshToken = refreshToken
        await user.save()

        // 7. Hide sensitive fields
        user.password = undefined
        user.refreshToken = undefined

        // 8. Set cookies
        res.cookie("accessToken", accessToken, ACCESS_TOKEN_COOKIE)
        res.cookie("refreshToken", refreshToken, REFRESH_TOKEN_COOKIE)

        return res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user,
        })

    } catch (error) {
        next(error)
    }
}


// ─────────────────────────────────────────────
// REFRESH ACCESS TOKEN
// called automatically by frontend when 401 received
// ─────────────────────────────────────────────

export async function refreshAccessToken(req, res, next) {
    try {
        // 1. Get refresh token from httpOnly cookie
        const incomingRefreshToken = req.cookies?.refreshToken

        if (!incomingRefreshToken) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized — no refresh token"
            })
        }

        // 2. Verify the token signature and expiry
        let decoded
        try {
            decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        } catch (err) {
            // Token is tampered or expired
            return res.status(401).json({
                success: false,
                message: "Invalid or expired refresh token — please login again"
            })
        }

        // 3. Find user and check if refresh token matches what's in DB
        const user = await userModel
            .findById(decoded._id)
            .select("+refreshToken")

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            })
        }

        // ─── REUSE DETECTION (most important security check) ─────────────────
        // If the incoming token does NOT match what's in DB, it means:
        //   - The token was already used and rotated (but someone is replaying the old one)
        //   - OR an attacker stole a refresh token
        // Solution: IMMEDIATELY invalidate ALL sessions for this user
        if (user.refreshToken !== incomingRefreshToken) {
            user.refreshToken = null                    // kill all sessions
            await user.save()

            // Clear cookies on the client too
            res.clearCookie("accessToken", CLEAR_COOKIE)
            res.clearCookie("refreshToken", CLEAR_COOKIE)

            return res.status(401).json({
                success: false,
                message: "Refresh token reuse detected — all sessions invalidated. Please login again."
            })
        }

        // 4. Everything valid — rotate tokens (issue brand new pair)
        const newAccessToken = user.jwtToken()
        const newRefreshToken = user.refreshTokenGenerator()  // NEW refresh token every time

        // 5. Save new refresh token in DB — old one is now dead
        user.refreshToken = newRefreshToken
        await user.save()

        // 6. Set new cookies
        res.cookie("accessToken", newAccessToken, ACCESS_TOKEN_COOKIE)
        res.cookie("refreshToken", newRefreshToken, REFRESH_TOKEN_COOKIE)

        return res.status(200).json({
            success: true,
            message: "Tokens refreshed"
        })

    } catch (error) {
        next(error)
    }
}


// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────


export async function logout(req, res, next) {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken

        if (incomingRefreshToken) {
            // Decode without verifying — we just need the user ID to clear DB
            const decoded = jwt.decode(incomingRefreshToken)

            if (decoded?._id) {
                // Invalidate refresh token in DB — even if hacker has the cookie, it's dead
                await userModel.findByIdAndUpdate(decoded._id, {
                    refreshToken: null
                })
            }
        }

        // Clear both cookies from browser
        res.clearCookie("accessToken", CLEAR_COOKIE)
        res.clearCookie("refreshToken", CLEAR_COOKIE)

        return res.status(200).json({
            success: true,
            message: "Logged out successfully"
        })

    } catch (error) {
        next(error)
    }
}

