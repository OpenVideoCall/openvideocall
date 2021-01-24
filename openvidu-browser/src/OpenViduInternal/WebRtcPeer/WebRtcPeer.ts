/*
 * (C) Copyright 2017-2020 OpenVidu (https://openvidu.io)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import freeice = require('freeice');
import uuid = require('uuid');
import { OpenViduLogger } from '../Logger/OpenViduLogger';
import { PlatformUtils } from '../Utils/Platform';

/**
 * @hidden
 */
const logger: OpenViduLogger = OpenViduLogger.getInstance();
/**
 * @hidden
 */
let platform: PlatformUtils;

// 3 spatial simulcast layers, with a different SSRC and RID for each layer.
// RTCRtpEncodingParameters[]
// https://w3c.github.io/webrtc-pc/#dom-rtcrtpencodingparameters
//
// NOTE: mediasoup assumes that encodings are ordered from lowest to highest
// quality.
// See: https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/#Simulcast
const simulcastEncodings = [
  {
    rid: "r0",
    maxBitrate: 700000,
    scaleResolutionDownBy: 16.0,
    // scaleResolutionDownBy: 4.0,

    // mediasoup-client/Chrome74.ts:send()
    // https://w3c.github.io/webrtc-svc/#scalabilitymodes*
    // https://w3c.github.io/webrtc-svc/#dependencydiagrams*
    // scalabilityMode: "L1T3",
  },
  {
    rid: "r1",
    maxBitrate: 800000,
    scaleResolutionDownBy: 8.0,
    // scaleResolutionDownBy: 2.0,

    // mediasoup-client/Chrome74.ts:send()
    // scalabilityMode: "L1T3",
  },
  {
    rid: "r2",
    maxBitrate: 900000,
    scaleResolutionDownBy: 1.0,

    // mediasoup-client/Chrome74.ts:send()
    // scalabilityMode: "L1T3",
  },
];

export interface WebRtcPeerConfiguration {
    mediaConstraints: {
        audio: boolean,
        video: boolean
    };
    simulcast: boolean;
    onicecandidate: (event) => void;
    iceServers: RTCIceServer[] | undefined;
    mediaStream?: MediaStream;
    mode?: 'sendonly' | 'recvonly' | 'sendrecv';
    id?: string;
}

export class WebRtcPeer {

    pc: RTCPeerConnection;
    id: string;
    remoteCandidatesQueue: RTCIceCandidate[] = [];
    localCandidatesQueue: RTCIceCandidate[] = [];

    iceCandidateList: RTCIceCandidate[] = [];

    private candidategatheringdone = false;

    constructor(protected configuration: WebRtcPeerConfiguration) {
        platform = PlatformUtils.getInstance();
        this.configuration.iceServers = (!!this.configuration.iceServers && this.configuration.iceServers.length > 0) ? this.configuration.iceServers : freeice();

        this.pc = new RTCPeerConnection({ iceServers: this.configuration.iceServers });
        this.id = !!configuration.id ? configuration.id : this.generateUniqueId();

        this.pc.onicecandidate = event => {
            if (!!event.candidate) {
                const candidate: RTCIceCandidate = event.candidate;
                if (candidate) {
                    this.localCandidatesQueue.push(<RTCIceCandidate>{ candidate: candidate.candidate });
                    this.candidategatheringdone = false;
                    this.configuration.onicecandidate(event.candidate);
                } else if (!this.candidategatheringdone) {
                    this.candidategatheringdone = true;
                }
            }
        };

        this.pc.onsignalingstatechange = () => {
            if (this.pc.signalingState === 'stable') {
                while (this.iceCandidateList.length > 0) {
                    let candidate = this.iceCandidateList.shift();
                    this.pc.addIceCandidate(<RTCIceCandidate>candidate);
                }
            }
        };

        this.start();
    }

    /**
     * This function creates the RTCPeerConnection object taking into account the
     * properties received in the constructor. It starts the SDP negotiation
     * process: generates the SDP offer and invokes the onsdpoffer callback. This
     * callback is expected to send the SDP offer, in order to obtain an SDP
     * answer from another peer.
     */
    start(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.pc.signalingState === 'closed') {
                reject('The peer connection object is in "closed" state. This is most likely due to an invocation of the dispose method before accepting in the dialogue');
            }
            if (!!this.configuration.mediaStream) {
                for (const track of this.configuration.mediaStream.getTracks()) {
                    const tcInit: any = {
                        direction: this.configuration.mode,
                        streams: [this.configuration.mediaStream],
                    };
                    if (track.kind === "video") {
                        tcInit.sendEncodings = simulcastEncodings;
                    }
                    const _tc = this.pc.addTransceiver(track, tcInit);
                }
                resolve();
            }
        });
    }

    /**
     * This method frees the resources used by WebRtcPeer
     */
    dispose() {
        logger.debug('Disposing WebRtcPeer');
        if (this.pc) {
            if (this.pc.signalingState === 'closed') {
                return;
            }
            this.pc.close();
            this.remoteCandidatesQueue = [];
            this.localCandidatesQueue = [];
        }
    }

    /**
     * Creates an SDP offer from the local RTCPeerConnection to send to the other peer
     * Only if the negotiation was initiated by the this peer
     */
    createOffer(): Promise<RTCSessionDescriptionInit> {
        return new Promise((resolve, reject) => {
            let offerAudio, offerVideo = true;

            // Constraints must have both blocks
            if (!!this.configuration.mediaConstraints) {
                offerAudio = (typeof this.configuration.mediaConstraints.audio === 'boolean') ?
                    this.configuration.mediaConstraints.audio : true;
                offerVideo = (typeof this.configuration.mediaConstraints.video === 'boolean') ?
                    this.configuration.mediaConstraints.video : true;
            }

            const constraints: RTCOfferOptions = {
                offerToReceiveAudio: (this.configuration.mode !== 'sendonly' && offerAudio),
                offerToReceiveVideo: (this.configuration.mode !== 'sendonly' && offerVideo)
            };

            logger.debug('RTCPeerConnection constraints: ' + JSON.stringify(constraints));

            this.pc.createOffer(constraints)
                .then(offer => {
                    logger.debug('Created SDP offer');
                    resolve(offer);
                })
                .catch(error => reject(error));
        });
    }

    /**
     * Creates an SDP answer from the local RTCPeerConnection to send to the other peer
     * Only if the negotiation was initiated by the other peer
     */
    createAnswer(): Promise<RTCSessionDescriptionInit> {
        return new Promise((resolve, reject) => {
            let offerAudio, offerVideo = true;
            if (!!this.configuration.mediaConstraints) {
                offerAudio = (typeof this.configuration.mediaConstraints.audio === 'boolean') ?
                    this.configuration.mediaConstraints.audio : true;
                offerVideo = (typeof this.configuration.mediaConstraints.video === 'boolean') ?
                    this.configuration.mediaConstraints.video : true;
            }
            const constraints: RTCOfferOptions = {
                offerToReceiveAudio: offerAudio,
                offerToReceiveVideo: offerVideo
            };
            this.pc.createAnswer(constraints).then(sdpAnswer => {
                resolve(sdpAnswer);
            }).catch(error => {
                reject(error);
            });
        });
    }

    /**
     * This peer initiated negotiation. Step 1/4 of SDP offer-answer protocol
     */
    processLocalOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        return new Promise((resolve, reject) => {
            this.pc.setLocalDescription(offer)
                .then(() => {
                    const localDescription = this.pc.localDescription;
                    if (!!localDescription) {
                        logger.debug('Local description set', localDescription.sdp);
                        resolve();
                    } else {
                        reject('Local description is not defined');
                    }
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    /**
     * Other peer initiated negotiation. Step 2/4 of SDP offer-answer protocol
     */
    processRemoteOffer(sdpOffer: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const offer: RTCSessionDescriptionInit = {
                type: 'offer',
                sdp: sdpOffer
            };
            logger.debug('SDP offer received, setting remote description', offer);

            if (this.pc.signalingState === 'closed') {
                reject('RTCPeerConnection is closed when trying to set remote description');
            }
            this.setRemoteDescription(offer)
                .then(() => {
                    resolve();
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    /**
     * Other peer initiated negotiation. Step 3/4 of SDP offer-answer protocol
     */
    processLocalAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        return new Promise((resolve, reject) => {
            logger.debug('SDP answer created, setting local description');
            if (this.pc.signalingState === 'closed') {
                reject('RTCPeerConnection is closed when trying to set local description');
            }
            this.pc.setLocalDescription(answer)
                .then(() => resolve())
                .catch(error => reject(error));
        });
    }

    /**
     * This peer initiated negotiation. Step 4/4 of SDP offer-answer protocol
     */
    processRemoteAnswer(sdpAnswer: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const answer: RTCSessionDescriptionInit = {
                type: 'answer',
                sdp: sdpAnswer
            };
            logger.debug('SDP answer received, setting remote description');

            if (this.pc.signalingState === 'closed') {
                reject('RTCPeerConnection is closed when trying to set remote description');
            }
            this.setRemoteDescription(answer)
                .then(() => resolve())
                .catch(error => reject(error));
        });
    }

    /**
     * @hidden
     */

// FIXME CONFLICT WITH MASTER
// In the mediasoup branch, the special treatment for ionic was removed:
//   openvidu-browser: removed Ionic iOS timeout on first subscription
//   https://github.com/OpenVidu/openvidu/commit/23d64be8063f8fdb2a212ca845e304762f2803f5
// and also the method was converted into async and returned a Promise.
// However in master the code is still like the old one.
<<<<<<< HEAD
    async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
        return this.pc.setRemoteDescription(sdp);
=======
    setRemoteDescription(answer: RTCSessionDescriptionInit, needsTimeoutOnProcessAnswer: boolean, resolve: (value?: string | PromiseLike<string> | undefined) => void, reject: (reason?: any) => void) {
        if (platform.isIonicIos()) {
            // Ionic iOS platform
            if (needsTimeoutOnProcessAnswer) {
                // 400 ms have not elapsed yet since first remote stream triggered Stream#initWebRtcPeerReceive
                setTimeout(() => {
                    logger.info('setRemoteDescription run after timeout for Ionic iOS device');
                    this.pc.setRemoteDescription(new RTCSessionDescription(answer)).then(() => resolve()).catch(error => reject(error));
                }, 250);
            } else {
                // 400 ms have elapsed
                this.pc.setRemoteDescription(new RTCSessionDescription(answer)).then(() => resolve()).catch(error => reject(error));
            }
        } else {
            // Rest of platforms
            this.pc.setRemoteDescription(answer).then(() => resolve()).catch(error => reject(error));
        }
>>>>>>> master
    }

    /**
     * Callback function invoked when an ICE candidate is received
     */
    addIceCandidate(iceCandidate: RTCIceCandidate): Promise<void> {
        return new Promise((resolve, reject) => {
            logger.debug('Remote ICE candidate received', iceCandidate);
            this.remoteCandidatesQueue.push(iceCandidate);
            switch (this.pc.signalingState) {
                case 'closed':
                    reject(new Error('PeerConnection object is closed'));
                    break;
                case 'stable':
                    if (!!this.pc.remoteDescription) {
                        this.pc.addIceCandidate(iceCandidate).then(() => resolve()).catch(error => reject(error));
                    } else {
                        this.iceCandidateList.push(iceCandidate);
                        resolve();
                    }
                    break;
                default:
                    this.iceCandidateList.push(iceCandidate);
                    resolve();
            }
        });
    }

    addIceConnectionStateChangeListener(otherId: string) {
        this.pc.oniceconnectionstatechange = () => {
            const iceConnectionState: RTCIceConnectionState = this.pc.iceConnectionState;
            switch (iceConnectionState) {
                case 'disconnected':
                    // Possible network disconnection
                    logger.warn('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "disconnected". Possible network disconnection');
                    break;
                case 'failed':
                    logger.error('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') to "failed"');
                    break;
                case 'closed':
                    logger.log('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "closed"');
                    break;
                case 'new':
                    logger.log('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "new"');
                    break;
                case 'checking':
                    logger.log('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "checking"');
                    break;
                case 'connected':
                    logger.log('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "connected"');
                    break;
                case 'completed':
                    logger.log('IceConnectionState of RTCPeerConnection ' + this.id + ' (' + otherId + ') change to "completed"');
                    break;
            }
        }
    }

    /**
     * @hidden
     */
    generateUniqueId(): string {
        return uuid.v4();
    }

}


export class WebRtcPeerRecvonly extends WebRtcPeer {
    constructor(configuration: WebRtcPeerConfiguration) {
        configuration.mode = 'recvonly';
        super(configuration);
    }
}

export class WebRtcPeerSendonly extends WebRtcPeer {
    constructor(configuration: WebRtcPeerConfiguration) {
        configuration.mode = 'sendonly';
        super(configuration);
    }
}

export class WebRtcPeerSendrecv extends WebRtcPeer {
    constructor(configuration: WebRtcPeerConfiguration) {
        configuration.mode = 'sendrecv';
        super(configuration);
    }
}
