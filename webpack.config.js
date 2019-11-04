module.exports = {
    module: {
        rules: [
            { test: /\.glsl$/, use: 'webpack-glsl-loader' }
        ]
    }
};