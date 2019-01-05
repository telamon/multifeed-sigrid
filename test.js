var test = require('tape')
var multifeed = require('../multifeed')
var ram = require('random-access-memory')
var hypercore = require('hypercore')
var crypto = require('hypercore-crypto')
var sigrid = require('.')


test('Signature store serialization', function(t) {
  t.plan(4)
  var pair = crypto.keyPair()
  var sig = sigrid(pair.publicKey, ram, pair.secretKey)
  sig.setSignature('foo', 'bar', function(err) {
      t.error(err)
      t.equal(sig._signatures['foo'], 'bar', 'New signature visible after set')
      delete sig._signatures // simulate loss of in-memory sighash
      sig._reload(function(err) {
        t.error(err)
        t.equal(sig._signatures['foo'], 'bar', 'Signatures loaded correctly')
      })
  })
})

test('Signed replication', function(t) {
  t.plan(23)
  // Given a preshared keypair that can be derived
  // from a secret phrase or generated and then
  // shared.
  var pair = crypto.keyPair()
  // All three use the same public key, but only two of them know the private key.
  var computer = null
  var laptop = null
  var hashbase = null
  var unsignedFeed = null

  function spawnMultiFeed(opts, cb) {
    var haveSecret = !!opts.secretKey
    var m = multifeed(hypercore, ram)
    var sig = sigrid(opts.key, ram, opts.secretKey)
    m.use(sig)
    var buf = "dummy"

    m.once('feed', function (feed, name) {
      if (haveSecret) {
        let signature = sig._signatures[feed.key.toString('hex')]
        t.ok(signature, 'Should have a signature')
        t.ok(crypto.verify(feed.key, Buffer.from(signature, 'hex'), m.key), 'signature should be verified')
      } else {
        // Should still produce the feed, but it will not be replicated anywhere.
        t.equal(feed.key.length, 32)
        unsignedFeed = feed.key.toString('hex')
      }
    })

    m.writer(function (err, w) {
      t.error(err)
      t.ok(w.secretKey, 'Should be writeable regardless of signed state')
      w.append(buf, function (err) {
        t.error(err)
        w.get(0, function (err, data) {
          t.error(err)
          t.equals(data.toString('utf8'), buf)
          cb()
        })
      })
    })
    // t.deepEquals(m.feeds(), [w])
    return m
  }

  function replicate(a, b, cb) {
    var r = a.replicate()
    r.pipe(b.replicate()).pipe(r)
      .once('end', cb)
  }

  function fkeys(a) {
    return a.map(function(f) { return f.key.toString('hex') }).sort()
  }

  computer = spawnMultiFeed({key: pair.publicKey, secretKey: pair.secretKey }, function(){
    laptop = spawnMultiFeed({key: pair.publicKey, secretKey: pair.secretKey }, function(){
      hashbase = spawnMultiFeed({key: pair.publicKey },function () {

        var unsignedFeed = fkeys(hashbase.feeds())[0]
        var signedFeeds = fkeys([].concat(computer.feeds()).concat(laptop.feeds()))
        var allFeeds = [unsignedFeed].concat(signedFeeds).sort()

        replicate(computer, laptop, function() {
          replicate(hashbase, laptop, function() {
            t.deepEquals(fkeys(computer.feeds()), signedFeeds)
            t.deepEquals(fkeys(laptop.feeds()), signedFeeds)
            t.deepEquals(fkeys(hashbase.feeds()), allFeeds)
          })
        })

      })
    })
  })

})
