
import { Router } from "express"
import { login, logout, refreshAccessToken, register, verifyEmail } from "../controllers/auth.controller.js"
import { loginValidator, registerValidator } from "../validators/auth.validator.js"

const router = Router()

/**
 * @METHOD POST
 * @ROUTE /api/auth/verify-email    
 */
router.get("/verify-email", verifyEmail)


/**
 * @METHOD POST
 * @ROUTE /api/auth/register    
 */

router.post("/register", registerValidator, register)

/**
 * @METHOD POST
 * @ROUTE /api/auth/login    
 */
router.post("/login", loginValidator, login)

/**
 * @METHOD POST
 * @ROUTE /api/auth/refresh
 */
router.post("/refresh", refreshAccessToken)

/**
 * @METHOD POST
 * @ROUTE /api/auth/logout
 */

router.post("/logout", logout)




export default router