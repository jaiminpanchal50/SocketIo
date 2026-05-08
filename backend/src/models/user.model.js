import mongoose from "mongoose";
import bcrypt from "bcryptjs"
import appConfig from "../configs/config.js";
import jwt from "jsonwebtoken"

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    isVerified: {
        type: Boolean,
        required: true,
        default: false
    },
    refreshToken:{
        type: String
    }
}, { timestamps: true })


userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return
    }
    this.password = await bcrypt.hash(this.password, 10);
})

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.jwtToken = function () {
    return jwt.sign({ id: this._id }, appConfig.JWT_SECRET, { expiresIn: appConfig.JWT_EXPIRE })
}



userSchema.methods.refreshTokenGenerator = function () {
    return jwt.sign({ id: this._id }, appConfig.JWT_REFRESH_SECRET, { expiresIn: appConfig.JWT_REFRESH_EXPIRE })
}




export default mongoose.model("user", userSchema)