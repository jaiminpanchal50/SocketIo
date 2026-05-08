import mongoose from "mongoose";
import appConfig from "./config.js";


function connectDB() {
    mongoose.connect(appConfig.MONGO_URL)
        .then(() => console.log("Database connected"))
        .catch((err) => console.log(err))
}

export default connectDB