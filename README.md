# Path-to-RegExp

> 将诸如 `/user/:name`形式的字符串编译为正则表达式，用于路由匹配.

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

## 安装

```
npm install path-to-regexp --save
```

## 使用方式

```javascript
const pathToRegexp = require("path-to-regexp");

// pathToRegexp(path, keys?, options?)
// pathToRegexp.parse(path)
// pathToRegexp.compile(path)
```

- **path** 可以表示字符串、字符串数组或者正则表达式.
- **keys** 在 path 中抽取的关键词数组，可以为空数组.
- **options**

  - **sensitive** 默认为 `false`，当为 `true`表示正则表达式大小写敏感.
  - **strict** 默认为 `false`，当为 `true` 表示正则表达式允许可选的尾部分隔符匹配
  - **end** 默认为 `true`，当为 `true` 则正则表达式会匹配到字符串末尾
  - **start** 默认为`true`，当为`true` 则正则表达式从字符串开始匹配
  - **delimiter** 默认分隔符为`/`.
  - **endsWith** 可选字符或者字符列表，表示 path 的默认字符
  - **whitelist** 字符列表，在解析时认为是分隔符。默认为`undefined`.

```javascript
const keys = [];
const regexp = pathToRegexp("/foo/:bar", keys);
// regexp = /^\/foo\/([^\/]+?)\/?$/i
// keys = [{ name: 'bar', prefix: '/', delimiter: '/', optional: false, repeat: false, pattern: '[^\\/]+?' }]
```

**备注:** 由 `path-to-regexp`返回的`RegExp`被用于有序数据，即数据结构的解释依赖于数据各部的顺序，比如路径名、主机名等，因此无法处理诸如 JSON、查询字符串以及 URL 片段等顺序无关的数据结构.

### 参数

在上面例子中，`/foo/:bar`中参数为`bar`，经过编译后生成关键词列表

#### 具名参数

所谓具名参数，就是以`:`前缀的参数名，比如`:bar`,该参数匹配直到下一个分隔符为止 (e.g. `[^/]+`).

```js
const regexp = pathToRegexp("/:foo/:bar");
// keys = [{ name: 'foo', prefix: '/', ... }, { name: 'bar', prefix: '/', ... }]

re.exec("/test/route");
//=> ['/test/route', 'test', 'route']
```

**备注:** 参数名必须是合法的单词结构，比如(`[A-Za-z0-9_]`).

####参数修饰符

##### 可选修饰

以`?`后缀的参数表示可选匹配

```js
const regexp = pathToRegexp("/:foo/:bar?");
// keys = [{ name: 'foo', ... }, { name: 'bar', delimiter: '/', optional: true, repeat: false }]

re.exec("/test");
//=> ['/test', 'test', undefined]

re.exec("/test/route");
//=> ['/test', 'test', 'route']
```

**小贴士:** 参数的前缀字符也可选, 基于转译符号 `\/` 来强制设置.

##### 零个或多个

以`*`后缀的参数表示零个或多个参数匹配，并按照前缀字符匹配.

```js
const regexp = pathToRegexp("/:foo*");
// keys = [{ name: 'foo', delimiter: '/', optional: true, repeat: true }]

re.exec("/");
//=> ['/', undefined]

re.exec("/bar/baz");
//=> ['/bar/baz', 'bar/baz']
```

##### 一个或多个

以`+`后缀的参数表示一个或多个参数匹配，并按照前缀字符匹配

```js
const regexp = pathToRegexp("/:foo+");
// keys = [{ name: 'foo', delimiter: '/', optional: false, repeat: true }]

re.exec("/");
//=> null

re.exec("/bar/baz");
//=> ['/bar/baz', 'bar/baz']
```

#### 匿名参数

基于匹配正则形式来填写匿名参数，模块在解析中按照索引形式填充关键词列表

```js
const regexp = pathToRegexp("/:foo/(.*)");
// keys = [{ name: 'foo', ... }, { name: 0, ... }]

regexp.exec("/test/route");
//=> ['/test/route', 'test', 'route']
```

#### 自定义匹配参数

所有参数可以具有自定义正则表达，其将会覆盖默认的 (`[^/]+`).

```js
const regexpNumbers = pathToRegexp("/icon-:foo(\\d+).png");
// keys = [{ name: 'foo', ... }]

regexpNumbers.exec("/icon-123.png");
//=> ['/icon-123.png', '123']

regexpNumbers.exec("/icon-abc.png");
//=> null

const regexpWord = pathToRegexp("/(user|u)");
// keys = [{ name: 0, ... }]

regexpWord.exec("/u");
//=> ['/u', 'u']

regexpWord.exec("/users");
//=> null
```

**小贴士:** 反斜杠在正则表达中需要转译处理.

### 解析函数

基于 `pathToRegexp.parse`暴露解析函数. 将返回一个字符串数组和关键词数组

```js
const tokens = pathToRegexp.parse("/route/:foo/(.*)");

console.log(tokens[0]);
//=> "/route"

console.log(tokens[1]);
//=> { name: 'foo', prefix: '/', delimiter: '/', optional: false, repeat: false, pattern: '[^\\/]+?' }

console.log(tokens[2]);
//=> { name: 0, prefix: '/', delimiter: '/', optional: false, repeat: false, pattern: '.*' }
```

**小贴士:** 只能处理字符串

### 编译过程

`Path-To-RegExp`暴露一个编译函数，用于将解析得到的字符串转换为合法的路径 path

```js
const toPath = pathToRegexp.compile("/user/:id");

toPath({ id: 123 }); //=> "/user/123"
toPath({ id: "café" }); //=> "/user/caf%C3%A9"
toPath({ id: "/" }); //=> "/user/%2F"

toPath({ id: ":/" }); //=> "/user/%3A%2F"
toPath({ id: ":/" }, { encode: (value, token) => value }); //=> "/user/:/"

const toPathRepeated = pathToRegexp.compile("/:segment+");

toPathRepeated({ segment: "foo" }); //=> "/foo"
toPathRepeated({ segment: ["a", "b", "c"] }); //=> "/a/b/c"

const toPathRegexp = pathToRegexp.compile("/user/:id(\\d+)");

toPathRegexp({ id: 123 }); //=> "/user/123"
toPathRegexp({ id: "123" }); //=> "/user/123"
toPathRegexp({ id: "abc" }); //=> Throws `TypeError`.
```

### Token 工作原理

`Path-To-RegExp`会暴露两个内部使用的函数

- `pathToRegexp.tokensToRegExp(tokens, keys?, options?)` 将一组 token 列表转化为匹配的正则表达式
- `pathToRegexp.tokensToFunction(tokens)` 将一组 token 列表转化为路径 path 生成器

#### Token 结构

- `name` token 的名词
- `prefix` token 的前缀，默认为`/`
- `delimiter` 用于划分 token 的分隔符，默认为`/`
- `optional`表示该 token 是否可选，如果可选则在正则匹配中可不参与匹配
- `repeat` 表示该 token 是否可重复-匹配
- `pattern` 匹配该 token 的正则表达式模式串

## 在线 demo

可以在[express-route-tester](http://forbeslindesay.github.com/express-route-tester/)观看 demo.

## 协议

MIT

[npm-image]: https://img.shields.io/npm/v/path-to-regexp.svg?style=flat
[npm-url]: https://npmjs.org/package/path-to-regexp
[travis-image]: https://img.shields.io/travis/pillarjs/path-to-regexp.svg?style=flat
[travis-url]: https://travis-ci.org/pillarjs/path-to-regexp
[coveralls-image]: https://img.shields.io/coveralls/pillarjs/path-to-regexp.svg?style=flat
[coveralls-url]: https://coveralls.io/r/pillarjs/path-to-regexp?branch=master
[david-image]: http://img.shields.io/david/pillarjs/path-to-regexp.svg?style=flat
[david-url]: https://david-dm.org/pillarjs/path-to-regexp
[license-image]: http://img.shields.io/npm/l/path-to-regexp.svg?style=flat
[license-url]: LICENSE.md
[downloads-image]: http://img.shields.io/npm/dm/path-to-regexp.svg?style=flat
[downloads-url]: https://npmjs.org/package/path-to-regexp
