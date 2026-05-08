import { config } from "dotenv";

config()

if (!process.env.PORT) {
    throw new Error("PORT is not present in env file");
}

if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not present in env file");
}

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not present in env file");
}

if (!process.env.JWT_EXPIRE) {
    throw new Error("JWT_EXPIRE is not present in env file");
}

if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET is not present in env file");
}

if (!process.env.JWT_REFRESH_EXPIRE) {
    throw new Error("JWT_REFRESH_EXPIRE is not present in env file");
}

const appConfig = {
    PORT: process.env.PORT,
    MONGO_URL: process.env.MONGO_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRE: process.env.JWT_EXPIRE,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE
}


export default appConfig
