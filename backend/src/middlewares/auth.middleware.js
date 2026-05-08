export async function getMe(req, res, next) {
    try {
        // req.user is set by the auth middleware
        const user = await userModel.findById(req.user._id)

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        return res.status(200).json({
            success: true,
            user
        })

    } catch (error) {
        next(error)
    }
}