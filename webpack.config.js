var path = require('path')

module.exports = {
    output: {
        library: "Populus",
    },
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        compress: true,
        port: 9000,
        // injectClient: false,
        // XXX: needed for exports, https://github.com/webpack/webpack-dev-server/issues/2484
        // So registration in dev-mode won't work without this.
    },
    resolve: {
        fallback: { 
            "buffer": require.resolve("buffer/") 
        },
    },
    module: {
        rules: [
            {
                test: /.m?js$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        "plugins": [
                            ["@babel/plugin-transform-react-jsx", {
                                "pragma": "h",
                                "pragmaFrag": "Fragment"
                            }],
                            "@babel/plugin-proposal-class-properties"
                        ]
                    }
                }
            }
        ]
    }
}
