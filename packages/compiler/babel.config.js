


module.exports = {
  presets: [
    '@babel/preset-env',
    "@babel/preset-flow",
    "@babel/preset-typescript"
  ],
  plugins: [
    ["@babel/plugin-proposal-decorators", { "legacy": true }],
    ["@babel/plugin-transform-class-properties", { "loose": true }],
    [require('./dist/index.cjs'),
    { optimize: true, isCustomElement: (tag) => /^x-/.test(tag) }],
  ],
};