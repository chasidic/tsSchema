const path = require('path');
const Parser = require('./dist/').Parser;
const readdirSync = require('fs').readdirSync;

const dir = path.join(__dirname, 'my-temp', 'schemas');
const files = readdirSync(dir, 'utf-8')
    .filter(x => x.startsWith('com.ubimo.cm'))
    .filter(x => !x.includes('Servlet'));

const parser = new Parser();

for (let file of files) {
    let filename = path.resolve(dir, file);
    try {
        parser.addFile(filename);
    } catch (e) {
        console.log(filename);
    }
}

parser.compose('cm.d.ts', error => {
    // console.log(error);
});
