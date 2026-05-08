import app from './src/app.js'
import appConfig from './src/configs/config.js'
import connectDB from './src/configs/db.js'


// database
connectDB()




app.listen(appConfig.PORT, () => {
    console.log(`Server is running on port ${appConfig.PORT}`)
})