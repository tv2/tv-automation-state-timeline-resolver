#!/bin/bash

cp ../LICENSE ./
cp ../src/types/package.json ./

rm -R dist
cp ../src/types/dist ./ -R
