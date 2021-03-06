var fs = require('fs');
var path = require('path');

var findRoot = require('find-root');
var mm = require('micromatch');

var JEST_ROOT_DIR_PREFIX = '<rootDir>/';

exports.interfaceVersion = 2;

// Default values defined by Jest that are required by this resolution process
var jestDefaultConfig = {
  moduleFileExtensions: ["js", "json", "jsx", "node"],
  moduleNameMapper: {},
  testMatch: ['**/__tests__/**/*.js?(x)', '**/?(*.)(spec|test).js?(x)']
};

exports.resolve = function (source, file, config) {
  var matches;
  var root = findRoot(file);
  var jestConfig = getJestConfig(file, config, root);
  var resolvedMatchers;
  var rootDir = getRootDir(jestConfig, root);

  if (jestConfig.testRegex) {
    matches = new RegExp(jestConfig.testRegex).test(file);
  } else {
    resolvedMatchers = resolveTestMatchers(jestConfig.testMatch, rootDir);
    matches = !!mm(file, resolvedMatchers).length;
  }
  if (!matches) {
    return {found: false};
  }

  var path = getMappedPath(source, jestConfig.moduleNameMapper, jestConfig.moduleFileExtensions, rootDir);

  if (!path) {
    return {found: false};
  }

  return {
    found: true,
    path: path
  };
};

/**
 * get the Jest configuration required for path resolution.
 * Will use jest configuration from package.json if no jestConfigFile is defined
 * Applies default configuration for any required properties that are undeclared
 * @param file Un-used
 * @param {Object} config
 * @param root directory where the package.json was located
 * @returns {Object}
 */
function getJestConfig(file, config, root) {
  var jestConfig;
  config = config || {};
  if (config.jestConfigFile) {
    jestConfig = require(path.resolve(root, config.jestConfigFile));
  } else {
    var packageJson = require(path.resolve(root, 'package.json'));
    jestConfig = packageJson.jest;
  }
  if (!jestConfig.testMatch && !jestConfig.testRegex) {
    jestConfig.testMatch = jestDefaultConfig.testMatch;
  }

  if (!jestConfig.moduleFileExtensions) {
    jestConfig.moduleFileExtensions = jestDefaultConfig.moduleFileExtensions;
  }

  if (!jestConfig.moduleNameMapper) {
    jestConfig.moduleNameMapper = jestDefaultConfig.moduleNameMapper;
  }

  return jestConfig;
}

/**
 * Resolve a source import to an absolute path
 * @param source Import path found within a Jest test file
 * @param moduleNameMapper A map from regular expressions to module names that allow to stub out resources
 * @param extensions File extensions to append to source path if no extension is defined
 * @param rootDir full working path
 * @returns {?String}
 */
function getMappedPath(source, moduleNameMapper, extensions, rootDir) {
  var moduleNameMappers = Object.keys(moduleNameMapper);
  for (var i = 0; i < moduleNameMappers.length; i++) {
    var regex = new RegExp(moduleNameMappers[i]);
    if (regex.test(source)) {
      var targetPath = moduleNameMapper[moduleNameMappers[i]];
      var modulePath = source.replace(regex, targetPath).replace(JEST_ROOT_DIR_PREFIX, '');

      return resolvePath(modulePath, extensions, rootDir);
    }
  }
}

/**
 * Resolve the working directory with the jest config root directory
 * @param {Object} config Jest configuration
 * @param {String} root working directory
 * @returns {String} Module resolution root directory
 */
function getRootDir(config, root) {
  if (config.rootDir) {
    return path.resolve(root, config.rootDir);
  } else {
    return root;
  }
}

/**
 * Resolve a module path with a root directory.  If no file extension is provided use a list of lookup extensions to append to the path.
 * Will also attempt to resolve to an index file
 * @param {String} modulePath
 * @param {String[]} extensions extensions to
 * @param {String} rootDir full working path
 * @returns {?String} Resolved rootDir/modulePath or rootDir/modulePath.ext or rootDir/modulePath/index.ext
 */
function resolvePath(modulePath, extensions, rootDir) {
  var mappedPath = path.resolve(rootDir, modulePath);

  if (path.extname(mappedPath)) {
    return mappedPath;
  }

  for (var i = 0; i < extensions.length; i++) {
    var ext = extensions[i];
    var pathWithExt = `${mappedPath}.${ext}`;

    if (fs.existsSync(pathWithExt)) {
      return pathWithExt;
    }

    var index = path.join(mappedPath, `index.${ext}`);
    if (fs.existsSync(index)) {
      return index;
    }
  }
  return undefined;
}

/**
 * Convert any testMatch entries that start with <rootDir>/ to the full root path
 * @param {String[]} testMatch entries
 * @param {String} rootDir full working path
 * @returns {Array}
 */
function resolveTestMatchers(testMatch, rootDir) {

  return testMatch.map(function (matcher) {
    if (matcher.startsWith(JEST_ROOT_DIR_PREFIX)) {
      return path.join(rootDir, matcher.replace(JEST_ROOT_DIR_PREFIX, ''));
    } else {
      return matcher;
    }
  });
}
