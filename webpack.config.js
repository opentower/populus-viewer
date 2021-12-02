const path = require('path')

module.exports = {
  entry: {
    main: "./src/index.js",
    "indexeddb-worker": "./src/indexeddb-worker.js"
  },
  stats: {
    errorDetails: true
  },
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    compress: true,
    port: 9000,
    host: '0.0.0.0'
    // ^^^ serve on LAN. Useful for testing mobile features
    // injectClient: false,
    // XXX: ^^^ needed for exports, so registration in dev-mode won't work without this.
    // see https://github.com/webpack/webpack-dev-server/issues/2484
  },
  resolve: {
    fallback: {
      buffer: require.resolve("buffer/")
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [
              ["@babel/plugin-transform-react-jsx", {
                pragma: "h",
                pragmaFrag: "Fragment"
              }],
              "@babel/plugin-proposal-class-properties"
            ]
          }
        }
      }
    ]
  }
}
