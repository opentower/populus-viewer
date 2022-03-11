const path = require('path')
const {InjectManifest} = require('workbox-webpack-plugin');

module.exports = (_, argv) => {
  return {
    entry: {
      main: "./src/index.js",
      "indexeddb-worker": "./src/indexeddb-worker.js"
    },
    plugins: argv.mode === 'production'
      ? [
          new InjectManifest({
            swSrc: "./src/service-worker.js",
            maximumFileSizeToCacheInBytes: 10485760 // ten megabytes
          })
        ]
      : [],
    stats: {
      errorDetails: true
    },
    devServer: {
      client: {
        overlay: {
          errors: true,
          warnings: false
        }
      },
      compress: true,
      port: 9000,
      host: '0.0.0.0'
      // ^^^ serve on LAN. Useful for testing mobile features
    },
    resolve: {
      fallback: {
        buffer: require.resolve("buffer/"),
        url: require.resolve("url/")
      }
    },
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"]
        },
        {
          include: path.resolve(__dirname, "assets"),
          type: 'asset/resource',
          generator: {
            filename: '[name][ext]'
          }
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
}
