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
var myDevice = multifeed(hypercore, storage)
myDevice.use(sig)
laptop.writer('hylog', function(err, writer) {
  writer.append({ entry: 'Today i took a stroll on the beach' })
})

// A multifeed that cannot create replicating writers
var sig = sigrid(publicKey, storage)
var paidHosting = multifeed(hypercore, storage)
```


**developers-note**

This module is not available through npm yet as it depends on
an experimental multifeed api, but feel free to start experimenting
using this fork: [telamon/multifeed/feature/repl-api](https://github.com/telamon/multifeed/tree/feature/repl-api)

The Sigrid API can be considered stable for `v1.0.0`

Planned features:

* (`v1`) optional 'feed-control-feed' that let's a secretKey owner mark previously
  signed feeds for deletion/removal from the swarm. (There's no guarantee that
  a node you don't control actually will stop replicating killed feeds but for
  devices you control this can be considered law)

* (`v2`) let sigrid manage multiple public-keys to create a 'friend' network
  where each individual replicate's the entire groups signed feeds but remains
  in full control over his own feeds.
