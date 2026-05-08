export function errorHandler(err, req, res, next) {
    console.log("error", err);

    return res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        stack: err.stack
    })

}