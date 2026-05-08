import express from 'express'

import cookieParser from 'cookie-parser'
import mongan from 'morgan'

const app = express()





// middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(mongan('dev'))


// routes import
import authRouter from './routes/auth.route.js'
import { errorHandler } from './middlewares/errorHandler.middleware.js'


// routes
app.use('/api/auth', authRouter)



app.use(errorHandler)

export default app