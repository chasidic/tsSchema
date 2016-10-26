#!/usr/bin/env node
'use strict';

// Usage example:
// ./bin/tsSchema.js --cwd /home/ilan/clients/root/java/tools/JSONSchema --out cm.d.ts "schemas/com.ubimo.cm.*.json" "\!schemas/com.ubimo.cm.*Servlet.json"

const log = console.log;
const minimist = require('minimist');
const vfs = require('vinyl-fs');
const through = require('through');
const File = require('vinyl');

const Parser = require('../dist').Parser;
const unknown = [];
const argv = minimist(process.argv.slice(2));

const schmea = (fileName) => {

  let files = [];

  let onFile = (file) => files.push(file);

  let onEnd = function () {
    if (files.length) {
      let targetFile = new File({ path: fileName });
      let parser = new Parser();

      for (let file of files) {
        parser.addFile(file.path);
      }

      parser.compose(fileName, error => {
        this.emit('data', targetFile);
      });
    }

    this.emit('end');
  };

  return through(onFile, onEnd);
};

const glob = argv._;
const cwd = argv.cwd;
const out = argv.out;
vfs.src(glob, { cwd }).pipe(schmea(out));
