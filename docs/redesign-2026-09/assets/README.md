# assets

## bsc5-v50.json

夜间「池面倒影」用的真实星空：Yale Bright Star Catalog 第 5 版中视星等 ≤ 5.0 的 1630 颗星。

- 格式：扁平整数数组，每 4 个数一颗星：`[赤经×10（度）, 赤纬×10（度）, 视星等×10, 色温/100（K）]`
- 大小：25 KB，gzip 后约 10 KB
- 来源：由 [brettonw/YaleBrightStarCatalog](https://github.com/brettonw/YaleBrightStarCatalog) 的 `bsc5-short.json` 精简而来；原始星表为 [Yale Bright Star Catalog（Harvard CfA 分发）](http://tdc-www.harvard.edu/catalogs/bsc5.html)
- 精简方式：保留 `V ≤ 5.0` 的星，把赤经赤纬换算成十分之一度，缺色温的按 6000K 处理

转换数据所附许可：

```
MIT License

Copyright (c) 2016 Bretton Wade

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
