#!/usr/bin/env bash

rm -rf ./dist
mkdir ./dist

cd ./src

find . -name "*.js" |
  xargs -I {} sh -c 'outfile="../dist/{}"; npx esbuild "{}" --bundle --sourcemap --outfile="${outfile%.*}.js"'

cp ./*.html ../dist
