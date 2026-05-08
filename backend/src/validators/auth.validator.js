import { body, validationResult } from 'express-validator'


function validate(req, res, next) {
    const errors = validationResult(req)
    console.log("validationResult", errors)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    next()

}


export const registerValidator = [
    body('name').isString().withMessage('Name must be a string'),
    body('email').isEmail().withMessage('Email must be a valid email'),
    body('password').isString().withMessage('Password must be a string'),
    validate
]



export const loginValidator = [
    body('email').isEmail().withMessage('Email must be a valid email'),
    body('password').isString().withMessage('Password must be a string'),
    validate
]