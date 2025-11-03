gen:
    gen-app-env.js && gen-package-exports.js --is_module --is_relative --dir src/lib --out src/lib
build:
    just gen && yarn build
genp:
    ts-generate-code-prompt.py --dir src