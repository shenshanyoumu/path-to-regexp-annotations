/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp;
module.exports.parse = parse;
module.exports.compile = compile;
module.exports.tokensToFunction = tokensToFunction;
module.exports.tokensToRegExp = tokensToRegExp;

// 路径path默认的分隔符
var DEFAULT_DELIMITER = "/";

// 构造的路径匹配工具
var PATH_REGEXP = new RegExp(
  [
    //  特定的转义字符匹配
    "(\\\\.)",

    // ":test(\\d+)?" => ["test", "\d+", undefined, "?"]
    // "(\\d+)"  => [undefined, undefined, "\d+", undefined]
    "(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?"
  ].join("|"),
  "g"
);

/**
 * 将字符串根据规则解析出一系列基础token
 * @param {*} str
 * @param {*} options
 */
function parse(str, options) {
  var tokens = [];
  var key = 0;
  var index = 0;
  var path = "";

  // 路径token的分隔符，默认为'/'
  var defaultDelimiter = (options && options.delimiter) || DEFAULT_DELIMITER;
  var whitelist = (options && options.whitelist) || undefined;
  var pathEscaped = false;
  var res;

  while ((res = PATH_REGEXP.exec(str)) !== null) {
    var m = res[0];
    var escaped = res[1];
    var offset = res.index;
    path += str.slice(index, offset);
    index = offset + m.length;

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1];
      pathEscaped = true;
      continue;
    }

    var prev = "";
    var name = res[2];
    var capture = res[3];
    var group = res[4];
    var modifier = res[5];

    if (!pathEscaped && path.length) {
      var k = path.length - 1;
      var c = path[k];
      var matches = whitelist ? whitelist.indexOf(c) > -1 : true;

      if (matches) {
        prev = c;
        path = path.slice(0, k);
      }
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path);
      path = "";
      pathEscaped = false;
    }

    var repeat = modifier === "+" || modifier === "*";
    var optional = modifier === "?" || modifier === "*";
    var pattern = capture || group;
    var delimiter = prev || defaultDelimiter;

    tokens.push({
      name: name || key++,
      prefix: prev,
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      pattern: pattern
        ? escapeGroup(pattern)
        : "[^" +
          escapeString(
            delimiter === defaultDelimiter
              ? delimiter
              : delimiter + defaultDelimiter
          ) +
          "]+?"
    });
  }

  // Push any remaining characters.
  if (path || index < str.length) {
    tokens.push(path + str.substr(index));
  }

  return tokens;
}

// 将字符串编译为模板函数
function compile(str, options) {
  return tokensToFunction(parse(str, options));
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction(tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length);

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === "object") {
      matches[i] = new RegExp("^(?:" + tokens[i].pattern + ")$");
    }
  }

  return function(data, options) {
    var path = "";
    var encode = (options && options.encode) || encodeURIComponent;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (typeof token === "string") {
        path += token;
        continue;
      }

      var value = data ? data[token.name] : undefined;
      var segment;

      if (Array.isArray(value)) {
        if (!token.repeat) {
          throw new TypeError(
            'Expected "' + token.name + '" to not repeat, but got array'
          );
        }

        if (value.length === 0) {
          if (token.optional) continue;

          throw new TypeError('Expected "' + token.name + '" to not be empty');
        }

        for (var j = 0; j < value.length; j++) {
          segment = encode(value[j], token);

          if (!matches[i].test(segment)) {
            throw new TypeError(
              'Expected all "' +
                token.name +
                '" to match "' +
                token.pattern +
                '"'
            );
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment;
        }

        continue;
      }

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        segment = encode(String(value), token);

        if (!matches[i].test(segment)) {
          throw new TypeError(
            'Expected "' +
              token.name +
              '" to match "' +
              token.pattern +
              '", but got "' +
              segment +
              '"'
          );
        }

        path += token.prefix + segment;
        continue;
      }

      if (token.optional) continue;

      throw new TypeError(
        'Expected "' +
          token.name +
          '" to be ' +
          (token.repeat ? "an array" : "a string")
      );
    }

    return path;
  };
}

// 将正则表达式进行转义处理，从而生成正则化的字符串
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}

// 将()形态的正则表达式进行转义处理，从而生成正则化的字符串
function escapeGroup(group) {
  return group.replace(/([=!:$/()])/g, "\\$1");
}

// 正则匹配时是否大小写敏感
function flags(options) {
  return options && options.sensitive ? "" : "i";
}

/**
 * 从正则到正则，比如`/user/list`的正则其实与`/user/:list`应该是等价的
 * @param {*} path
 * @param {*} keys
 */
function regexpToRegexp(path, keys) {
  if (!keys) {
    return path;
  }

  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g);

  // 针对匿名参数的匹配，返回的token名称为索引值
  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        pattern: null
      });
    }
  }

  return path;
}

/**
 * 将path数组的每个元素进行正则生成
 * @param {*} path 路径数组
 * @param {*} keys 待抽取path关键词数组
 * @param {*} options 生成正则的规则选项
 */
function arrayToRegexp(path, keys, options) {
  var parts = [];

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source);
  }

  return new RegExp("(?:" + parts.join("|") + ")", flags(options));
}

/**
 * 这是最基础的正则生成函数，将表示path的字符串生成对应的正则表达式
 * @param {*} path
 * @param {*} keys
 * @param {*} options
 */
function stringToRegexp(path, keys, options) {
  return tokensToRegExp(parse(path, options), keys, options);
}

// 将提取的tokens列表转化为正则表达式列表
function tokensToRegExp(tokens, keys, options) {
  options = options || {};

  // 当为true，则表示正则表达式允许可选的尾部分隔符匹配
  var strict = options.strict;
  var start = options.start !== false;
  var end = options.end !== false;
  var delimiter = options.delimiter || DEFAULT_DELIMITER;
  var endsWith = []
    .concat(options.endsWith || [])
    .map(escapeString)
    .concat("$")
    .join("|");
  var route = start ? "^" : "";

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];

    if (typeof token === "string") {
      route += escapeString(token);
    } else {
      var capture = token.repeat
        ? "(?:" +
          token.pattern +
          ")(?:" +
          escapeString(token.delimiter) +
          "(?:" +
          token.pattern +
          "))*"
        : token.pattern;

      if (keys) keys.push(token);

      if (token.optional) {
        if (!token.prefix) {
          route += "(" + capture + ")?";
        } else {
          route += "(?:" + escapeString(token.prefix) + "(" + capture + "))?";
        }
      } else {
        route += escapeString(token.prefix) + "(" + capture + ")";
      }
    }
  }

  if (end) {
    if (!strict) route += "(?:" + escapeString(delimiter) + ")?";

    route += endsWith === "$" ? "$" : "(?=" + endsWith + ")";
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited =
      typeof endToken === "string"
        ? endToken[endToken.length - 1] === delimiter
        : endToken === undefined;

    if (!strict)
      route += "(?:" + escapeString(delimiter) + "(?=" + endsWith + "))?";
    if (!isEndDelimited)
      route += "(?=" + escapeString(delimiter) + "|" + endsWith + ")";
  }

  // route参数为正则化字符串，基于此生成对应的path正则表达式
  return new RegExp(route, flags(options));
}

/**
 * 根据给定的路径path字符串，返回对应的正则表达式。
 * 软件在运行中返回真实的path字符串，然后基于下面函数生成对应的正则表达式，最后与项目的路由表进行匹配
 * @param {*} path 真实的路径字符串，当然也可以是正则表达式字符串
 * @param {*} keys 解析路径path后生成的关键词列表
 * @param {*} options 一些控制正则生成规则的选项
 */
function pathToRegexp(path, keys, options) {
  // 如果path是正则表达式，则调用下面函数
  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys);
  }

  // 如果path是一组字符串列表，则调用下面
  if (Array.isArray(path)) {
    return arrayToRegexp(/** @type {!Array} */ (path), keys, options);
  }

  return stringToRegexp(/** @type {string} */ (path), keys, options);
}
