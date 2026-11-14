/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for WebTransport which were missing in the
 * Closure compiler.
 *
 * @externs
 */


/** @type {string} */
WebTransport.prototype.protocol;


/**
 * The `protocols` member of WebTransportOptions: the application protocols
 * the client offers, which the browser sends in the WT-Available-Protocols
 * header and the server answers in WebTransport.prototype.protocol.
 *
 * Closure's own WebTransportOptions typedef (w3c_webtransport.js) predates
 * it, and an ADVANCED build renames any property no extern names. Without
 * this declaration lib/msf/msf_transport.js passes the offer under a
 * minified name, the browser ignores it, and a relay that negotiates the
 * MoQT version from the subprotocol (moxygen) closes the session with
 * VERSION_NEGOTIATION_FAILED. Debug builds keep the name, which hid it.
 *
 * @record
 * @see https://w3c.github.io/webtransport/#dom-webtransportoptions-protocols
 */
function WebTransportProtocolsOption() {}


/** @type {(!Array<string>|undefined)} */
WebTransportProtocolsOption.prototype.protocols;
