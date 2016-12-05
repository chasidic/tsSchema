const resolve = require('path').resolve;
const Parser = require('./dist/').Parser;
const readFileSync = require('fs').readFileSync;
const readdirSync = require('fs').readdirSync;

const dir = resolve(process.env['_UBIMO_JAVA'], 'tools/JSONSchema/schemas');


const files = readdirSync(dir, 'utf-8')
  .filter(x => x.startsWith('com.ubimo.cm'))
  .filter(x => !x.includes('Servlet'))

const parser = new Parser();

for (let file of files) {
  let filename = resolve(dir, file);
  parser.addFile(filename);
}

parser.compose('cm.d.ts', error => {
  // console.log(error);
});
