/*
 *  multifeed-sigrid - Signature based replication rules for noffle/multifeed
 *  Copyright (C) <2018>  <Tony Ivanov>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

var crypto = require('hypercore-crypto')
var debug = require('debug')('multifeed-sigrid')
var SIGNATURES_JSON = 'signatures.json'
var assert = require('assert')
/**
 * @param key {String|Buffer} will only replicate feeds that are signed with
 *          this key
 * @param storage {RandomAccess} A random-access storage used for persisting known signatures
 *          locally
 * @param secret {String|Buffer} enables local writers to be signed for replication.
 */
function Sigrid(key, storage, secret) {
  if (!(this instanceof Sigrid)) return new Sigrid(key, storage, secret)
  assert.ok(key, 'Signature checking key is required')
  assert.ok(storage, 'Storage is required')
  this.key = ensureBuffer(key)
  this._canSign = !!secret
  this._secret = ensureBuffer(secret)
  this._store = storage(SIGNATURES_JSON)
  this._signatures = {}
}
Sigrid.prototype.init = function(multifeed) {
  multifeed.key = this.key  // overwrite multifeed's encryption key,
                            // might remove this for purposes other than
                            // personal-feed
  multifeed.prependListener('feed', this._onFeed.bind(this))
  this._reload()
}

Sigrid.prototype.have = function(local, next) {
  var self = this
  // only share verified feed-keys
  var feedKeys = local.keys.filter(function(fkey){
    return verify(fkey, self._signatures[fkey], self.key)
  })

  // extract their signatures
  var sigs = feedKeys.map(function(key) { return self._signatures[key] })
  next(feedKeys, {signatures: sigs})
}

Sigrid.prototype.want = function(remote, next) {
  var self = this
  var sigsDiscovered = false
  var verified = remote.keys.filter(function(fkey, i) {
    var valid = verify(fkey, self._signatures[fkey] || remote.signatures[i], self.key)
    if (valid && !self._signatures[fkey]) {
      self._signatures[fkey] = remote.signatures[i]
      sigsDiscovered = true
    }
    return valid
  })
  if (sigsDiscovered) self._save(function (err) {
    if (err) throw err
    next(verified)
  })
  else next(verified)
}

/**
 * @param feed {String|Buffer} containing feed's key
 * @param signature {String|Buffer} containing signature
 * @param [done] {Function} called when new signature is successfully stored
 */
Sigrid.prototype.setSignature = function(feed, signature, done) {
  if (typeof done !== 'function') done = function(err) { if(err) throw err }
  feed = stringKey(feed)
  signature = stringKey(signature)
  this._signatures = this._signatures || {}
  this._signatures[feed] = signature
  this._save(done)
}


Sigrid.prototype._save = function(done) {
  if (typeof done !== 'function') done = function(err) { if(err) throw err }
  this._signatures = this._signatures || {}
  var self = this
  var sigBuf = Buffer.from(JSON.stringify(self._signatures))
  var sizeBuf = Buffer.alloc(4)
  sizeBuf.writeUInt32LE(sigBuf.length)

  self._store.write(0, sizeBuf, function(err) {
    if (err) return done(err)
    self._store.write(4, sigBuf, done)
  })
}

Sigrid.prototype._reload = function (done) {
  if (typeof done !== 'function') done = function(err) { if(err) throw err }
  var self = this
  self._signatures = {}
  self._store.stat(function(err, stat) {
    if ((err && err.code === 'ENOENT') || (stat && stat.size === 0)) {
      return done(null, self._signatures)
    } else if (err) return done(err)

    self._store.read(0,4,function(err, chunk) {
      if (err) {
        debug('Loading signatures failed, this is normal for empty multifeeds', err.message)
        return done()
      }
      var size = chunk.readUInt32LE()
      self._store.read(4, size, function(err, chunk) {
        if (err) return done(err)
        self._signatures = JSON.parse(chunk.toString('utf8'))
        debug('Signatures reloaded')
        done(null, self._signatures)
      })
    })
  })
}

Sigrid.prototype._onFeed = function(feed, name) {
  if(feed.writable) this._createSignature(feed.key)
}

Sigrid.prototype._createSignature = function  (buffer, done) {
  if (typeof done !== 'function') done = function(err) { if(err) throw err }
  if (!this._canSign) return done()
  buffer = ensureBuffer(buffer)
  // Sign the feed using provided private key
  var sig = crypto.sign(buffer, this._secret)
  debug("Signing new writer", buffer.toString('hex'), sig.toString('hex'))

  // Verify the signature
  if (!verify(buffer, sig, this.key)) {
    return done(new Error('Invalid signature produced, have you provided a correct key pair?'))
  }
  // Store the signature
  this.setSignature(buffer, sig, done)
}

module.exports = Sigrid

function verify (msg, sig, key) {
  if (!msg || !sig || !key) return false
  return crypto.verify(
    ensureBuffer(msg),
    ensureBuffer(sig),
    ensureBuffer(key)
  )
}

function stringKey(input) {
  if (Buffer.isBuffer(input)) return input.toString('hex')
  return input
}

function ensureBuffer(input) {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'undefined' || input === null) return input
  return Buffer.from(input, 'hex')
}
