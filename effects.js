// Subpath entry so the main entry stays free of Skia. A real file rather than only an
// "exports" map, so bundlers without package exports support resolve it too.
module.exports = require('./build/effects');
