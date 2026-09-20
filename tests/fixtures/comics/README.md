Synthetic comic archives generated for Quire's format tests. Each contains an
original 2x2 PNG and ComicInfo.xml. No third-party book content is included.

- rar4.cbr: stored RAR4
- rar5.cbr: stored RAR5
- lzma2.cb7: 7-Zip LZMA2 with solid compression and compressed headers
- copy.cb7: 7-Zip Copy method

These mirror the server's internal/server/testdata/comics fixtures. They exercise
real browser WASM decoding in addition to the mocked archive lifecycle tests.
