multifeed-sigrid
================

Provides signature-based replication rules for [multifeed](https://github.com/noffle/multifeed)
that lets anybody who has the 'public' signing key replicate all feeds freely.
Only nodes that possess the 'secret' key can create new writers or append
feeds to the multifeed.

**Usage:**

```js
var hypercore = require('hypercore')
var storage = require('random-access-file')
var crypto = require('hypercore-crypto')
var sigrid = require('multifeed-sigrid')

// generate a signing pair
var {publicKey, secretKey} = crypto.keyPair()
// publicKey can be shared freely to help replicating your feeds
// secretKey should be distributed safely to trusted sources

// A multifeed that can create writers
var sig = sigrid(publicKey, storage, secretKey)
var myDevice = multifeed(hypercore, storage, {key: publicKey})
myDevice.use(sig)
laptop.writer('hylog', function(err, writer) {
  writer.append({ entry: 'Today i took a stroll on the beach' })
})

// A multifeed that cannot create replicating writers
var sig = sigrid(publicKey, storage)
var paidHosting = multifeed(hypercore, storage, {key: publicKey})
```
