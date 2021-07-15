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

import { Connection } from './Connection';
import { Filter } from './Filter';
import { Session } from './Session';
import { StreamManager } from './StreamManager';
import { Subscriber } from './Subscriber';
import { InboundStreamOptions } from '../OpenViduInternal/Interfaces/Private/InboundStreamOptions';
import { OutboundStreamOptions } from '../OpenViduInternal/Interfaces/Private/OutboundStreamOptions';
import { WebRtcPeer, WebRtcPeerSendonly, WebRtcPeerRecvonly, WebRtcPeerSendrecv, WebRtcPeerConfiguration } from '../OpenViduInternal/WebRtcPeer/WebRtcPeer';
import { WebRtcStats } from '../OpenViduInternal/WebRtcStats/WebRtcStats';
import { ExceptionEvent, ExceptionEventName } from '../OpenViduInternal/Events/ExceptionEvent';
import { PublisherSpeakingEvent } from '../OpenViduInternal/Events/PublisherSpeakingEvent';
import { StreamManagerEvent } from '../OpenViduInternal/Events/StreamManagerEvent';
import { StreamPropertyChangedEvent } from '../OpenViduInternal/Events/StreamPropertyChangedEvent';
import { OpenViduError, OpenViduErrorName } from '../OpenViduInternal/Enums/OpenViduError';
import { OpenViduLogger } from '../OpenViduInternal/Logger/OpenViduLogger';
import { PlatformUtils } from '../OpenViduInternal/Utils/Platform';

/**
 * @hidden
 */
import hark = require('hark');
/**
 * @hidden
 */
import EventEmitter = require('wolfy87-eventemitter');
/**
 * @hidden
 */
const logger: OpenViduLogger = OpenViduLogger.getInstance();

/**
 * @hidden
 */
let platform: PlatformUtils;

/**
 * Represents each one of the media streams available in OpenVidu Server for certain session.
 * Each [[Publisher]] and [[Subscriber]] has an attribute of type Stream, as they give access
 * to one of them (sending and receiving it, respectively)
 */
export class Stream {

    /**
     * The Connection object that is publishing the stream
     */
    connection: Connection;

    /**
     * Frame rate of the video in frames per second. This property is only defined if the [[Publisher]] of
     * the stream was initialized passing a _frameRate_ property on [[OpenVidu.initPublisher]] method
     */
    frameRate?: number;

    /**
     * Whether the stream has a video track or not
     */
    hasVideo: boolean;

    /**
     * Whether the stream has an audio track or not
     */
    hasAudio: boolean;

    /**
     * Whether the stream has the video track muted or unmuted. If [[hasVideo]] is false, this property is undefined.
     *
     * This property may change if the Publisher publishing the stream calls [[Publisher.publishVideo]]. Whenever this happens a [[StreamPropertyChangedEvent]] will be dispatched
     * by the Session object as well as by the affected Subscriber/Publisher object
     */
    videoActive: boolean;

    /**
     * Whether the stream has the audio track muted or unmuted. If [[hasAudio]] is false, this property is undefined
     *
     * This property may change if the Publisher publishing the stream calls [[Publisher.publishAudio]]. Whenever this happens a [[StreamPropertyChangedEvent]] will be dispatched
     * by the Session object as well as by the affected Subscriber/Publisher object
     */
    audioActive: boolean;

    /**
     * Unique identifier of the stream. If the stream belongs to a...
     * - Subscriber object: property `streamId` is always defined
     * - Publisher object: property `streamId` is only defined after successful execution of [[Session.publish]]
     */
    streamId: string;

    /**
     * Time when this stream was created in OpenVidu Server (UTC milliseconds). Depending on the owner of this stream:
     * - Subscriber object: property `creationTime` is always defined
     * - Publisher object: property `creationTime` is only defined after successful execution of [[Session.publish]]
     */
    creationTime: number;

    /**
     * Can be:
     * - `"CAMERA"`: when the video source comes from a webcam.
     * - `"SCREEN"`: when the video source comes from screen-sharing.
     * - `"CUSTOM"`: when [[PublisherProperties.videoSource]] has been initialized in the Publisher side with a custom MediaStreamTrack when calling [[OpenVidu.initPublisher]]).
     * - `"IPCAM"`: when the video source comes from an IP camera participant instead of a regular participant (see [IP cameras](/en/stable/advanced-features/ip-cameras/)).
     *
     * If [[hasVideo]] is false, this property is undefined
     */
    typeOfVideo?: string;

    /**
     * StreamManager object ([[Publisher]] or [[Subscriber]]) in charge of displaying this stream in the DOM
     */
    streamManager: StreamManager;

    /**
     * Width and height in pixels of the encoded video stream. If [[hasVideo]] is false, this property is undefined
     *
     * This property may change if the Publisher that is publishing:
     * - If it is a mobile device, whenever the user rotates the device.
     * - If it is screen-sharing, whenever the user changes the size of the captured window.
     *
     * Whenever this happens a [[StreamPropertyChangedEvent]] will be dispatched by the Session object as well as by the affected Subscriber/Publisher object
     */
    videoDimensions: { width: number, height: number };

    /**
     * **WARNING**: experimental option. This interface may change in the near future
     *
     * Filter applied to the Stream. You can apply filters by calling [[Stream.applyFilter]], execute methods of the applied filter with
     * [[Filter.execMethod]] and remove it with [[Stream.removeFilter]]. Be aware that the client calling this methods must have the
     * necessary permissions: the token owned by the client must have been initialized with the appropriated `allowedFilters` array.
     */
    filter?: Filter;

    protected webRtcPeer: WebRtcPeer;
    protected mediaStream?: MediaStream;
    private webRtcStats: WebRtcStats;

    private isSubscribeToRemote = false;

    /**
     * @hidden
     */
    isLocalStreamReadyToPublish = false;
    /**
     * @hidden
     */
    isLocalStreamPublished = false;
    /**
     * @hidden
     */
    publishedOnce = false;
    /**
     * @hidden
     */
    session: Session;
    /**
     * @hidden
     */
    inboundStreamOpts: InboundStreamOptions;
    /**
     * @hidden
     */
    outboundStreamOpts: OutboundStreamOptions;
    /**
     * @hidden
     */
    speechEvent: any;
    /**
     * @hidden
     */
    harkSpeakingEnabled = false;
    /**
     * @hidden
     */
    harkSpeakingEnabledOnce = false;
    /**
     * @hidden
     */
    harkStoppedSpeakingEnabled = false;
    /**
     * @hidden
     */
    harkStoppedSpeakingEnabledOnce = false;
    /**
     * @hidden
     */
    harkVolumeChangeEnabled = false;
    /**
     * @hidden
     */
    harkVolumeChangeEnabledOnce = false;
    /**
     * @hidden
     */
    harkOptions;
    /**
     * @hidden
     */
    localMediaStreamWhenSubscribedToRemote?: MediaStream;
    /**
     * @hidden
     */
    ee = new EventEmitter();
    /**
     * @hidden
     */
    reconnectionEventEmitter: EventEmitter | undefined;


    /**
     * @hidden
     */
    constructor(session: Session, options: InboundStreamOptions | OutboundStreamOptions | {}) {

        platform = PlatformUtils.getInstance();
        this.session = session;

        if (options.hasOwnProperty('id')) {
            // InboundStreamOptions: stream belongs to a Subscriber
            this.inboundStreamOpts = <InboundStreamOptions>options;
            this.streamId = this.inboundStreamOpts.id;
            this.creationTime = this.inboundStreamOpts.createdAt;
            this.hasAudio = this.inboundStreamOpts.hasAudio;
            this.hasVideo = this.inboundStreamOpts.hasVideo;
            if (this.hasAudio) {
                this.audioActive = this.inboundStreamOpts.audioActive;
            }
            if (this.hasVideo) {
                this.videoActive = this.inboundStreamOpts.videoActive;
                this.typeOfVideo = (!this.inboundStreamOpts.typeOfVideo) ? undefined : this.inboundStreamOpts.typeOfVideo;
                this.frameRate = (this.inboundStreamOpts.frameRate === -1) ? undefined : this.inboundStreamOpts.frameRate;
                this.videoDimensions = this.inboundStreamOpts.videoDimensions;
            }
            if (!!this.inboundStreamOpts.filter && (Object.keys(this.inboundStreamOpts.filter).length > 0)) {
                if (!!this.inboundStreamOpts.filter.lastExecMethod && Object.keys(this.inboundStreamOpts.filter.lastExecMethod).length === 0) {
                    delete this.inboundStreamOpts.filter.lastExecMethod;
                }
                this.filter = this.inboundStreamOpts.filter;
            }
        } else {
            // OutboundStreamOptions: stream belongs to a Publisher
            this.outboundStreamOpts = <OutboundStreamOptions>options;

            this.hasAudio = this.isSendAudio();
            this.hasVideo = this.isSendVideo();

            if (this.hasAudio) {
                this.audioActive = !!this.outboundStreamOpts.publisherProperties.publishAudio;
            }
            if (this.hasVideo) {
                this.videoActive = !!this.outboundStreamOpts.publisherProperties.publishVideo;
                this.frameRate = this.outboundStreamOpts.publisherProperties.frameRate;
                if (typeof MediaStreamTrack !== 'undefined' && this.outboundStreamOpts.publisherProperties.videoSource instanceof MediaStreamTrack) {
                    this.typeOfVideo = 'CUSTOM';
                } else {
                    this.typeOfVideo = this.isSendScreen() ? 'SCREEN' : 'CAMERA';
                }
            }
            if (!!this.outboundStreamOpts.publisherProperties.filter) {
                this.filter = this.outboundStreamOpts.publisherProperties.filter;
            }
        }

        this.ee.on('mediastream-updated', () => {
            this.streamManager.updateMediaStream(this.mediaStream!);
            logger.debug('Video srcObject [' + this.mediaStream + '] updated in stream [' + this.streamId + ']');
        });
    }


    /**
     * Recreates the media connection with the server. This entails the disposal of the previous RTCPeerConnection and the re-negotiation
     * of a new one, that will apply the same properties.
     *
     * This method can be useful in those situations were there the media connection breaks and OpenVidu is not able to recover on its own
     * for any kind of unanticipated reason (see [Automatic reconnection](/en/latest/advanced-features/automatic-reconnection/)).
     *
     * @returns A Promise (to which you can optionally subscribe to) that is resolved if the reconnection operation was successful and rejected with an Error object if not
     */
    public reconnect(): Promise<void> {
        return this.reconnectStream('API');
    }

    /**
     * Applies an audio/video filter to the stream.
     *
     * @param type Type of filter applied. See [[Filter.type]]
     * @param options Parameters used to initialize the filter. See [[Filter.options]]
     *
     * @returns A Promise (to which you can optionally subscribe to) that is resolved to the applied filter if success and rejected with an Error object if not
     */
    applyFilter(type: string, options: Object): Promise<Filter> {
        return new Promise((resolve, reject) => {

            if (!this.session.sessionConnected()) {
                reject(this.session.notConnectedError());
            }

            logger.info('Applying filter to stream ' + this.streamId);
            options = options != null ? options : {};
            let optionsString = options;
            if (typeof optionsString !== 'string') {
                optionsString = JSON.stringify(optionsString);
            }
            this.session.openvidu.sendRequest(
                'applyFilter',
                { streamId: this.streamId, type, options: optionsString },
                (error, response) => {
                    if (error) {
                        logger.error('Error applying filter for Stream ' + this.streamId, error);
                        if (error.code === 401) {
                            reject(new OpenViduError(OpenViduErrorName.OPENVIDU_PERMISSION_DENIED, "You don't have permissions to apply a filter"));
                        } else {
                            reject(error);
                        }
                    } else {
                        logger.info('Filter successfully applied on Stream ' + this.streamId);
                        const oldValue: Filter = this.filter!;
                        this.filter = new Filter(type, options);
                        this.filter.stream = this;
                        this.session.emitEvent('streamPropertyChanged', [new StreamPropertyChangedEvent(this.session, this, 'filter', this.filter, oldValue, 'applyFilter')]);
                        this.streamManager.emitEvent('streamPropertyChanged', [new StreamPropertyChangedEvent(this.streamManager, this, 'filter', this.filter, oldValue, 'applyFilter')]);
                        resolve(this.filter);
                    }
                }
            );
        });
    }

    /**
     * Removes an audio/video filter previously applied.
     *
     * @returns A Promise (to which you can optionally subscribe to) that is resolved if the previously applied filter has been successfully removed and rejected with an Error object in other case
     */
    removeFilter(): Promise<void> {
        return new Promise((resolve, reject) => {

            if (!this.session.sessionConnected()) {
                reject(this.session.notConnectedError());
            }

            logger.info('Removing filter of stream ' + this.streamId);
            this.session.openvidu.sendRequest(
                'removeFilter',
                { streamId: this.streamId },
                (error, response) => {
                    if (error) {
                        logger.error('Error removing filter for Stream ' + this.streamId, error);
                        if (error.code === 401) {
                            reject(new OpenViduError(OpenViduErrorName.OPENVIDU_PERMISSION_DENIED, "You don't have permissions to remove a filter"));
                        } else {
                            reject(error);
                        }
                    } else {
                        logger.info('Filter successfully removed from Stream ' + this.streamId);
                        const oldValue = this.filter!;
                        delete this.filter;
                        this.session.emitEvent('streamPropertyChanged', [new StreamPropertyChangedEvent(this.session, this, 'filter', this.filter!, oldValue, 'applyFilter')]);
                        this.streamManager.emitEvent('streamPropertyChanged', [new StreamPropertyChangedEvent(this.streamManager, this, 'filter', this.filter!, oldValue, 'applyFilter')]);
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Returns the internal RTCPeerConnection object associated to this stream (https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
     *
     * @returns Native RTCPeerConnection Web API object
     */
    getRTCPeerConnection(): RTCPeerConnection {
        return this.webRtcPeer.pc;
    }

    /**
     * Returns the internal MediaStream object associated to this stream (https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)
     *
     * @returns Native MediaStream Web API object
     */
    getMediaStream(): MediaStream {
        return this.mediaStream!;
    }

    /* Hidden methods */

    /**
     * @hidden
     */
    setMediaStream(mediaStream: MediaStream): void {
        this.mediaStream = mediaStream;
    }

    /**
     * @hidden
     */
    updateMediaStreamInVideos() {
        this.ee.emitEvent('mediastream-updated', []);
    }

    /**
     * @hidden
     */
    getWebRtcPeer(): WebRtcPeer {
        return this.webRtcPeer;
    }

    /**
     * @hidden
     */
    subscribeToMyRemote(value: boolean): void {
        this.isSubscribeToRemote = value;
    }

    /**
     * @hidden
     */
    setOutboundStreamOptions(outboundStreamOpts: OutboundStreamOptions): void {
        this.outboundStreamOpts = outboundStreamOpts;
    }

    /**
     * @hidden
     */
    subscribe(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.initWebRtcPeerReceive(false)
                .then(() => {
                    resolve();
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    /**
     * @hidden
     */
    publish(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isLocalStreamReadyToPublish) {
                this.initWebRtcPeerSend(false)
                    .then(() => {
                        resolve();
                    })
                    .catch(error => {
                        reject(error);
                    });
            } else {
                this.ee.once('stream-ready-to-publish', () => {
                    this.publish()
                        .then(() => {
                            resolve();
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            }
        });
    }

    /**
     * @hidden
     */
    disposeWebRtcPeer(): void {
        let webrtcId;
        if (!!this.webRtcPeer) {
            this.webRtcPeer.dispose();
            webrtcId = this.webRtcPeer.getId();
        }
        this.stopWebRtcStats();
        logger.info((!!this.outboundStreamOpts ? 'Outbound ' : 'Inbound ') + "RTCPeerConnection with id [" + webrtcId + "] from 'Stream' with id [" + this.streamId + '] is now closed');
    }

    /**
     * @hidden
     */
    disposeMediaStream(): void {
        if (this.mediaStream) {
            const isSenderAndCustomTrack: boolean = !!this.outboundStreamOpts &&
                this.outboundStreamOpts.publisherProperties.videoSource instanceof MediaStreamTrack;

            if (!isSenderAndCustomTrack) {
                this.mediaStream.getAudioTracks().forEach((track) => {
                    track.stop();
                });
                this.mediaStream.getVideoTracks().forEach((track) => {
                    track.stop();
                });
            }
            delete this.mediaStream;
        }
        // If subscribeToRemote local MediaStream must be stopped
        if (this.localMediaStreamWhenSubscribedToRemote) {
            this.localMediaStreamWhenSubscribedToRemote.getAudioTracks().forEach((track) => {
                track.stop();
            });
            this.localMediaStreamWhenSubscribedToRemote.getVideoTracks().forEach((track) => {
                track.stop();
            });
            delete this.localMediaStreamWhenSubscribedToRemote;
        }
        if (!!this.speechEvent) {
            if (!!this.speechEvent.stop) {
                this.speechEvent.stop();
            }
            delete this.speechEvent;
        }
        logger.info((!!this.outboundStreamOpts ? 'Local ' : 'Remote ') + "MediaStream from 'Stream' with id [" + this.streamId + '] is now disposed');
    }

    /**
     * @hidden
     */
    displayMyRemote(): boolean {
        return this.isSubscribeToRemote;
    }

    /**
     * @hidden
     */
    isSendAudio(): boolean {
        return (!!this.outboundStreamOpts &&
            this.outboundStreamOpts.publisherProperties.audioSource !== null &&
            this.outboundStreamOpts.publisherProperties.audioSource !== false);
    }

    /**
     * @hidden
     */
    isSendVideo(): boolean {
        return (!!this.outboundStreamOpts &&
            this.outboundStreamOpts.publisherProperties.videoSource !== null &&
            this.outboundStreamOpts.publisherProperties.videoSource !== false);
    }

    /**
     * @hidden
     */
    isSendScreen(): boolean {
        let screen = this.outboundStreamOpts.publisherProperties.videoSource === 'screen';
        if (platform.isElectron()) {
            screen = typeof this.outboundStreamOpts.publisherProperties.videoSource === 'string' &&
                this.outboundStreamOpts.publisherProperties.videoSource.startsWith('screen:');
        }
        return !!this.outboundStreamOpts && screen;
    }

    /**
     * @hidden
     */
    enableHarkSpeakingEvent(): void {
        this.setHarkListenerIfNotExists();
        if (!this.harkSpeakingEnabled) {
            this.harkSpeakingEnabled = true;
            this.speechEvent.on('speaking', () => {
                this.session.emitEvent('publisherStartSpeaking', [new PublisherSpeakingEvent(this.session, 'publisherStartSpeaking', this.connection, this.streamId)]);
                this.streamManager.emitEvent('publisherStartSpeaking', [new PublisherSpeakingEvent(this.streamManager, 'publisherStartSpeaking', this.connection, this.streamId)]);
                this.harkSpeakingEnabledOnce = false; // Disable 'once' version if 'on' version was triggered
            });
        }
    }

    /**
     * @hidden
     */
    enableOnceHarkSpeakingEvent(): void {
        this.setHarkListenerIfNotExists();
        if (!this.harkSpeakingEnabledOnce) {
            this.harkSpeakingEnabledOnce = true;
            this.speechEvent.once('speaking', () => {
                if (this.harkSpeakingEnabledOnce) {
                    // If the listener has been disabled in the meantime (for example by the 'on' version) do not trigger the event
                    this.session.emitEvent('publisherStartSpeaking', [new PublisherSpeakingEvent(this.session, 'publisherStartSpeaking', this.connection, this.streamId)]);
                    this.streamManager.emitEvent('publisherStartSpeaking', [new PublisherSpeakingEvent(this.streamManager, 'publisherStartSpeaking', this.connection, this.streamId)]);
                }
                this.disableHarkSpeakingEvent(true);
            });
        }
    }

    /**
     * @hidden
     */
    disableHarkSpeakingEvent(disabledByOnce: boolean): void {
        if (!!this.speechEvent) {
            this.harkSpeakingEnabledOnce = false;
            if (disabledByOnce) {
                if (this.harkSpeakingEnabled) {
                    // The 'on' version of this same event is enabled too. Do not remove the hark listener
                    return;
                }
            } else {
                this.harkSpeakingEnabled = false;
            }
            // Shutting down the hark event
            if (this.harkVolumeChangeEnabled ||
                this.harkVolumeChangeEnabledOnce ||
                this.harkStoppedSpeakingEnabled ||
                this.harkStoppedSpeakingEnabledOnce) {
                // Some other hark event is enabled. Cannot stop the hark process, just remove the specific listener
                this.speechEvent.off('speaking');
            } else {
                // No other hark event is enabled. We can get entirely rid of it
                this.speechEvent.stop();
                delete this.speechEvent;
            }
        }
    }

    /**
     * @hidden
     */
    enableHarkStoppedSpeakingEvent(): void {
        this.setHarkListenerIfNotExists();
        if (!this.harkStoppedSpeakingEnabled) {
            this.harkStoppedSpeakingEnabled = true;
            this.speechEvent.on('stopped_speaking', () => {
                this.session.emitEvent('publisherStopSpeaking', [new PublisherSpeakingEvent(this.session, 'publisherStopSpeaking', this.connection, this.streamId)]);
                this.streamManager.emitEvent('publisherStopSpeaking', [new PublisherSpeakingEvent(this.streamManager, 'publisherStopSpeaking', this.connection, this.streamId)]);
                this.harkStoppedSpeakingEnabledOnce = false; // Disable 'once' version if 'on' version was triggered
            });
        }
    }

    /**
     * @hidden
     */
    enableOnceHarkStoppedSpeakingEvent(): void {
        this.setHarkListenerIfNotExists();
        if (!this.harkStoppedSpeakingEnabledOnce) {
            this.harkStoppedSpeakingEnabledOnce = true;
            this.speechEvent.once('stopped_speaking', () => {
                if (this.harkStoppedSpeakingEnabledOnce) {
                    // If the listener has been disabled in the meantime (for example by the 'on' version) do not trigger the event
                    this.session.emitEvent('publisherStopSpeaking', [new PublisherSpeakingEvent(this.session, 'publisherStopSpeaking', this.connection, this.streamId)]);
                    this.streamManager.emitEvent('publisherStopSpeaking', [new PublisherSpeakingEvent(this.streamManager, 'publisherStopSpeaking', this.connection, this.streamId)]);
                }
                this.disableHarkStoppedSpeakingEvent(true);
            });
        }
    }

    /**
    * @hidden
    */
    disableHarkStoppedSpeakingEvent(disabledByOnce: boolean): void {
        if (!!this.speechEvent) {
            this.harkStoppedSpeakingEnabledOnce = false;
            if (disabledByOnce) {
                if (this.harkStoppedSpeakingEnabled) {
                    // We are cancelling the 'once' listener for this event, but the 'on' version
                    // of this same event is enabled too. Do not remove the hark listener
                    return;
                }
            } else {
                this.harkStoppedSpeakingEnabled = false;
            }
            // Shutting down the hark event
            if (this.harkVolumeChangeEnabled ||
                this.harkVolumeChangeEnabledOnce ||
                this.harkSpeakingEnabled ||
                this.harkSpeakingEnabledOnce) {
                // Some other hark event is enabled. Cannot stop the hark process, just remove the specific listener
                this.speechEvent.off('stopped_speaking');
            } else {
                // No other hark event is enabled. We can get entirely rid of it
                this.speechEvent.stop();
                delete this.speechEvent;
            }
        }
    }

    /**
     * @hidden
     */
    enableHarkVolumeChangeEvent(force: boolean): void {
        if (this.setHarkListenerIfNotExists()) {
            if (!this.harkVolumeChangeEnabled || force) {
                this.harkVolumeChangeEnabled = true;
                this.speechEvent.on('volume_change', harkEvent => {
                    const oldValue = this.speechEvent.oldVolumeValue;
                    const value = { newValue: harkEvent, oldValue };
                    this.speechEvent.oldVolumeValue = harkEvent;
                    this.streamManager.emitEvent('streamAudioVolumeChange', [new StreamManagerEvent(this.streamManager, 'streamAudioVolumeChange', value)]);
                });
            }
        } else {
            // This way whenever the MediaStream object is available, the event listener will be automatically added
            this.harkVolumeChangeEnabled = true;
        }
    }

    /**
     * @hidden
     */
    enableOnceHarkVolumeChangeEvent(force: boolean): void {
        if (this.setHarkListenerIfNotExists()) {
            if (!this.harkVolumeChangeEnabledOnce || force) {
                this.harkVolumeChangeEnabledOnce = true;
                this.speechEvent.once('volume_change', harkEvent => {
                    const oldValue = this.speechEvent.oldVolumeValue;
                    const value = { newValue: harkEvent, oldValue };
                    this.speechEvent.oldVolumeValue = harkEvent;
                    this.disableHarkVolumeChangeEvent(true);
                    this.streamManager.emitEvent('streamAudioVolumeChange', [new StreamManagerEvent(this.streamManager, 'streamAudioVolumeChange', value)]);
                });
            }
        } else {
            // This way whenever the MediaStream object is available, the event listener will be automatically added
            this.harkVolumeChangeEnabledOnce = true;
        }
    }

    /**
     * @hidden
     */
    disableHarkVolumeChangeEvent(disabledByOnce: boolean): void {
        if (!!this.speechEvent) {
            this.harkVolumeChangeEnabledOnce = false;
            if (disabledByOnce) {
                if (this.harkVolumeChangeEnabled) {
                    // We are cancelling the 'once' listener for this event, but the 'on' version
                    // of this same event is enabled too. Do not remove the hark listener
                    return;
                }
            } else {
                this.harkVolumeChangeEnabled = false;
            }
            // Shutting down the hark event
            if (this.harkSpeakingEnabled ||
                this.harkSpeakingEnabledOnce ||
                this.harkStoppedSpeakingEnabled ||
                this.harkStoppedSpeakingEnabledOnce) {
                // Some other hark event is enabled. Cannot stop the hark process, just remove the specific listener
                this.speechEvent.off('volume_change');
            } else {
                // No other hark event is enabled. We can get entirely rid of it
                this.speechEvent.stop();
                delete this.speechEvent;
            }
        }
    }

    /**
     * @hidden
     */
    isLocal(): boolean {
        // inbound options undefined and outbound options defined
        return (!this.inboundStreamOpts && !!this.outboundStreamOpts);
    }

    /**
     * @hidden
     */
    getSelectedIceCandidate(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.webRtcStats.getSelectedIceCandidateInfo()
                .then(report => resolve(report))
                .catch(error => reject(error));
        });
    }

    /**
     * @hidden
     */
    getRemoteIceCandidateList(): RTCIceCandidate[] {
        return this.webRtcPeer.remoteCandidatesQueue;
    }

    /**
     * @hidden
     */
    getLocalIceCandidateList(): RTCIceCandidate[] {
        return this.webRtcPeer.localCandidatesQueue;
    }

    /**
     * @hidden
     */
    streamIceConnectionStateBroken() {
        if (!this.getWebRtcPeer() || !this.getRTCPeerConnection()) {
            return false;
        }
        if (this.isLocal() && !!this.session.openvidu.advancedConfiguration.forceMediaReconnectionAfterNetworkDrop) {
            logger.warn(`OpenVidu Browser advanced configuration option "forceMediaReconnectionAfterNetworkDrop" is enabled. Stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) will force a reconnection`);
            return true;
        }
        const iceConnectionState: RTCIceConnectionState = this.getRTCPeerConnection().iceConnectionState;
        return iceConnectionState !== 'connected' && iceConnectionState !== 'completed';
    }

    /* Private methods */

    private setHarkListenerIfNotExists(): boolean {
        if (!!this.mediaStream) {
            if (!this.speechEvent) {
                const harkOptions = !!this.harkOptions ? this.harkOptions : (this.session.openvidu.advancedConfiguration.publisherSpeakingEventsOptions || {});
                harkOptions.interval = (typeof harkOptions.interval === 'number') ? harkOptions.interval : 100;
                harkOptions.threshold = (typeof harkOptions.threshold === 'number') ? harkOptions.threshold : -50;
                this.speechEvent = hark(this.mediaStream, harkOptions);
            }
            return true;
        }
        return false;
    }

    /**
     * @hidden
     */
    setupReconnectionEventEmitter(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void): boolean {
        if (this.reconnectionEventEmitter == undefined) {
            // There is no ongoing reconnection
            this.reconnectionEventEmitter = new EventEmitter();
            return false;
        } else {
            // Ongoing reconnection
            console.warn(`Trying to reconnect stream ${this.streamId} (${this.isLocal() ? 'Publisher' : 'Subscriber'}) but an ongoing reconnection process is active. Waiting for response...`);
            this.reconnectionEventEmitter.once('success', () => {
                resolve();
            });
            this.reconnectionEventEmitter.once('error', error => {
                reject(error);
            });
            return true;
        }
    }

    /**
     * @hidden
     */
    initWebRtcPeerSend(reconnect: boolean): Promise<void> {
        return new Promise((resolve, reject) => {

            if (reconnect) {
                if (this.setupReconnectionEventEmitter(resolve, reject)) {
                    // Ongoing reconnection
                    return;
                }
            } else {
                // MediaStream will already have hark events for reconnected streams
                this.initHarkEvents(); // Init hark events for the local stream
            }

            const finalResolve = () => {
                if (reconnect) {
                    this.reconnectionEventEmitter?.emitEvent('success');
                    delete this.reconnectionEventEmitter;
                }
                resolve();
            }

            const finalReject = error => {
                if (reconnect) {
                    this.reconnectionEventEmitter?.emitEvent('error', [error]);
                    delete this.reconnectionEventEmitter;
                }
                reject(error);
            }

            const successOfferCallback = (sdpOfferParam) => {
                logger.debug('Sending SDP offer to publish as '
                    + this.streamId, sdpOfferParam);

                const method = reconnect ? 'reconnectStream' : 'publishVideo';
                let params;
                if (reconnect) {
                    params = {
                        stream: this.streamId,
                        sdpString: sdpOfferParam
                    }
                } else {
                    let typeOfVideo = '';
                    if (this.isSendVideo()) {
                        typeOfVideo = (typeof MediaStreamTrack !== 'undefined' && this.outboundStreamOpts.publisherProperties.videoSource instanceof MediaStreamTrack) ? 'CUSTOM' : (this.isSendScreen() ? 'SCREEN' : 'CAMERA');
                    }
                    params = {
                        doLoopback: this.displayMyRemote() || false,
                        hasAudio: this.isSendAudio(),
                        hasVideo: this.isSendVideo(),
                        audioActive: this.audioActive,
                        videoActive: this.videoActive,
                        typeOfVideo,
                        frameRate: !!this.frameRate ? this.frameRate : -1,
                        videoDimensions: JSON.stringify(this.videoDimensions),
                        filter: this.outboundStreamOpts.publisherProperties.filter,
                        sdpOffer: sdpOfferParam
                    }
                }

                this.session.openvidu.sendRequest(method, params, (error, response) => {
                    if (error) {
                        if (error.code === 401) {
                            finalReject(new OpenViduError(OpenViduErrorName.OPENVIDU_PERMISSION_DENIED, "You don't have permissions to publish"));
                        } else {
                            finalReject('Error on publishVideo: ' + JSON.stringify(error));
                        }
                    } else {
                        this.webRtcPeer.processRemoteAnswer(response.sdpAnswer)
                            .then(() => {
                                this.streamId = response.id;
                                this.creationTime = response.createdAt;
                                this.isLocalStreamPublished = true;
                                this.publishedOnce = true;
                                if (this.displayMyRemote()) {
                                    this.localMediaStreamWhenSubscribedToRemote = this.mediaStream;
                                    this.remotePeerSuccessfullyEstablished(reconnect);
                                }
                                if (reconnect) {
                                    this.ee.emitEvent('stream-reconnected-by-publisher', []);
                                } else {
                                    this.ee.emitEvent('stream-created-by-publisher', []);
                                }
                                this.initWebRtcStats();
                                logger.info("'Publisher' (" + this.streamId + ") successfully " + (reconnect ? "reconnected" : "published") + " to session");

                                finalResolve();
                            })
                            .catch(error => {
                                finalReject(error);
                            });
                    }
                });
            };

            const config: WebRtcPeerConfiguration = {
                mediaConstraints: {
                    audio: this.hasAudio,
                    video: this.hasVideo,
                },
                simulcast: this.session.openvidu.advancedConfiguration.enableSimulcastExperimental || false,
                onIceCandidate: this.connection.sendIceCandidate.bind(this.connection),
                onIceConnectionStateException: (exceptionName: ExceptionEventName, message: string, data?: any) => { this.session.emitEvent('exception', [new ExceptionEvent(this.session, exceptionName, this, message, data)]) },
                iceServers: this.getIceServersConf(),
                mediaStream: this.mediaStream,
                mediaServer: this.session.openvidu.mediaServer
            };

            if (reconnect) {
                this.disposeWebRtcPeer();
            }
            if (this.displayMyRemote()) {
                this.webRtcPeer = new WebRtcPeerSendrecv(config);
            } else {
                this.webRtcPeer = new WebRtcPeerSendonly(config);
            }
            this.webRtcPeer.addIceConnectionStateChangeListener('publisher of ' + this.connection.connectionId);
            this.webRtcPeer.createOffer().then(sdpOffer => {
                this.webRtcPeer.processLocalOffer(sdpOffer)
                    .then(() => {
                        successOfferCallback(sdpOffer.sdp);
                    }).catch(error => {
                        finalReject(new Error('(publish) SDP process local offer error: ' + JSON.stringify(error)));
                    });
            }).catch(error => {
                finalReject(new Error('(publish) SDP create offer error: ' + JSON.stringify(error)));
            });
        });
    }

    /**
     * @hidden
     */
    finalResolveForSubscription(reconnect: boolean, resolve: (value: void | PromiseLike<void>) => void) {
        logger.info("'Subscriber' (" + this.streamId + ") successfully " + (reconnect ? "reconnected" : "subscribed"));
        this.remotePeerSuccessfullyEstablished(reconnect);
        this.initWebRtcStats();
        if (reconnect) {
            this.reconnectionEventEmitter?.emitEvent('success');
            delete this.reconnectionEventEmitter;
        }
        resolve();
    }

    /**
     * @hidden
     */
    finalRejectForSubscription(reconnect: boolean, error: any, reject: (reason?: any) => void) {
        logger.error("Error for 'Subscriber' (" + this.streamId + ") while trying to " + (reconnect ? "reconnect" : "subscribe") + ": " + error.toString());
        if (reconnect) {
            this.reconnectionEventEmitter?.emitEvent('error', [error]);
            delete this.reconnectionEventEmitter;
        }
        reject(error);
    }

    /**
     * @hidden
     */
    initWebRtcPeerReceive(reconnect: boolean): Promise<void> {
        return new Promise((resolve, reject) => {

            if (reconnect) {
                if (this.setupReconnectionEventEmitter(resolve, reject)) {
                    // Ongoing reconnection
                    return;
                }
            }

            if (this.session.openvidu.mediaServer === 'mediasoup') {

                // Server initiates negotiation

                this.initWebRtcPeerReceiveFromServer(reconnect)
                    .then(() => this.finalResolveForSubscription(reconnect, resolve))
                    .catch(error => this.finalRejectForSubscription(reconnect, error, reject));

            } else {

                // Client initiates negotiation

                this.initWebRtcPeerReceiveFromClient(reconnect)
                    .then(() => this.finalResolveForSubscription(reconnect, resolve))
                    .catch(error => this.finalRejectForSubscription(reconnect, error, reject));

            }
        });
    }

    /**
     * @hidden
     */
    initWebRtcPeerReceiveFromClient(reconnect: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            this.completeWebRtcPeerReceive(reconnect, false).then(response => {
                this.webRtcPeer.processRemoteAnswer(response.sdpAnswer)
                    .then(() => resolve()).catch(error => reject(error));
            }).catch(error => reject(error));
        });
    }

    /**
     * @hidden
     */
    initWebRtcPeerReceiveFromServer(reconnect: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            // Server initiates negotiation
            this.session.openvidu.sendRequest('prepareReceiveVideoFrom', { sender: this.streamId, reconnect }, (error, response) => {
                if (error) {
                    reject(new Error('Error on prepareReceiveVideoFrom: ' + JSON.stringify(error)));
                } else {
                    this.completeWebRtcPeerReceive(reconnect, false, response.sdpOffer)
                        .then(() => resolve()).catch(error => reject(error));
                }
            });
        });
    }

    /**
     * @hidden
     */
    completeWebRtcPeerReceive(reconnect: boolean, forciblyReconnect: boolean, sdpOfferByServer?: string): Promise<any> {
        return new Promise((resolve, reject) => {

            logger.debug("'Session.subscribe(Stream)' called");

            const sendSdpToServer = (sdpString: string) => {

                logger.debug(`Sending local SDP ${(!!sdpOfferByServer ? 'answer' : 'offer')} to subscribe to ${this.streamId}`, sdpString);

                const method = reconnect ? 'reconnectStream' : 'receiveVideoFrom';
                const params = {};
                params[reconnect ? 'stream' : 'sender'] = this.streamId;
                if (!!sdpOfferByServer) {
                    params[reconnect ? 'sdpString' : 'sdpAnswer'] = sdpString;
                } else {
                    params['sdpOffer'] = sdpString;
                }
                if (reconnect) {
                    params['forciblyReconnect'] = forciblyReconnect;
                }

                this.session.openvidu.sendRequest(method, params, (error, response) => {
                    if (error) {
                        reject(new Error('Error on ' + method + ' : ' + JSON.stringify(error)));
                    } else {
                        resolve(response);
                    }
                });
            };

            const config: WebRtcPeerConfiguration = {
                mediaConstraints: {
                    audio: this.hasAudio,
                    video: this.hasVideo,
                },
                simulcast: false,
                onIceCandidate: this.connection.sendIceCandidate.bind(this.connection),
                onIceConnectionStateException: (exceptionName: ExceptionEventName, message: string, data?: any) => { this.session.emitEvent('exception', [new ExceptionEvent(this.session, exceptionName, this, message, data)]) },
                iceServers: this.getIceServersConf(),
                mediaServer: this.session.openvidu.mediaServer
            };

            if (reconnect) {
                this.disposeWebRtcPeer();
            }

            this.webRtcPeer = new WebRtcPeerRecvonly(config);
            this.webRtcPeer.addIceConnectionStateChangeListener(this.streamId);

            if (!!sdpOfferByServer) {

                this.webRtcPeer.processRemoteOffer(sdpOfferByServer).then(() => {
                    this.webRtcPeer.createAnswer().then(sdpAnswer => {
                        this.webRtcPeer.processLocalAnswer(sdpAnswer).then(() => {
                            sendSdpToServer(sdpAnswer.sdp!);
                        }).catch(error => {
                            reject(new Error('(subscribe) SDP process local answer error: ' + JSON.stringify(error)));
                        });
                    }).catch(error => {
                        reject(new Error('(subscribe) SDP create answer error: ' + JSON.stringify(error)));
                    });
                }).catch(error => {
                    reject(new Error('(subscribe) SDP process remote offer error: ' + JSON.stringify(error)));
                });

            } else {

                this.webRtcPeer.createOffer().then(sdpOffer => {
                    this.webRtcPeer.processLocalOffer(sdpOffer).then(() => {
                        sendSdpToServer(sdpOffer.sdp!);
                    }).catch(error => {
                        reject(new Error('(subscribe) SDP process local offer error: ' + JSON.stringify(error)));
                    });
                }).catch(error => {
                    reject(new Error('(subscribe) SDP create offer error: ' + JSON.stringify(error)));
                });

            }
        });
    }

    /**
     * @hidden
     */
    remotePeerSuccessfullyEstablished(reconnect: boolean): void {

        if (reconnect && this.mediaStream != null) {
            // Now we can destroy the existing MediaStream
            this.disposeMediaStream();
        }

        this.mediaStream = new MediaStream();
        let receiver: RTCRtpReceiver;
        for (receiver of this.webRtcPeer.pc.getReceivers()) {
            if (!!receiver.track) {
                this.mediaStream.addTrack(receiver.track);
            }
        }
        logger.debug('Peer remote stream', this.mediaStream);

        if (!!this.mediaStream) {

            if (this.streamManager instanceof Subscriber) {
                // Apply SubscriberProperties.subscribeToAudio and SubscriberProperties.subscribeToVideo
                if (!!this.mediaStream.getAudioTracks()[0]) {
                    const enabled = reconnect ? this.audioActive : !!((this.streamManager as Subscriber).properties.subscribeToAudio);
                    this.mediaStream.getAudioTracks()[0].enabled = enabled;
                }
                if (!!this.mediaStream.getVideoTracks()[0]) {
                    const enabled = reconnect ? this.videoActive : !!((this.streamManager as Subscriber).properties.subscribeToVideo);
                    this.mediaStream.getVideoTracks()[0].enabled = enabled;
                }
            }

            this.updateMediaStreamInVideos();
            this.initHarkEvents(); // Init hark events for the remote stream
        }
    }

    private initHarkEvents(): void {
        if (!!this.mediaStream!.getAudioTracks()[0]) {
            // Hark events can only be set if audio track is available
            if (this.session.anySpeechEventListenerEnabled('publisherStartSpeaking', true, this.streamManager)) {
                this.enableOnceHarkSpeakingEvent();
            }
            if (this.session.anySpeechEventListenerEnabled('publisherStartSpeaking', false, this.streamManager)) {
                this.enableHarkSpeakingEvent();
            }
            if (this.session.anySpeechEventListenerEnabled('publisherStopSpeaking', true, this.streamManager)) {
                this.enableOnceHarkStoppedSpeakingEvent();
            }
            if (this.session.anySpeechEventListenerEnabled('publisherStopSpeaking', false, this.streamManager)) {
                this.enableHarkStoppedSpeakingEvent();
            }
            if (this.harkVolumeChangeEnabledOnce) {
                this.enableOnceHarkVolumeChangeEvent(true);
            }
            if (this.harkVolumeChangeEnabled) {
                this.enableHarkVolumeChangeEvent(true);
            }
        }
    }

    private onIceConnectionStateExceptionHandler(exceptionName: ExceptionEventName, message: string, data?: any): void {
        switch (exceptionName) {
            case ExceptionEventName.ICE_CONNECTION_FAILED:
                this.onIceConnectionFailed();
                break;
            case ExceptionEventName.ICE_CONNECTION_DISCONNECTED:
                this.onIceConnectionDisconnected();
                break;
        }
        this.session.emitEvent('exception', [new ExceptionEvent(this.session, exceptionName, this, message, data)]);
    }

    private onIceConnectionFailed() {
        // Immediately reconnect, as this is a terminal error
        logger.log(`[ICE_CONNECTION_FAILED] Handling ICE_CONNECTION_FAILED event. Reconnecting stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')})`);
        this.reconnectStreamAndLogResultingIceConnectionState(ExceptionEventName.ICE_CONNECTION_FAILED);
    }

    private onIceConnectionDisconnected() {
        // Wait to see if the ICE connection is able to reconnect
        logger.log(`[ICE_CONNECTION_DISCONNECTED] Handling ICE_CONNECTION_DISCONNECTED event. Waiting for ICE to be restored and reconnect stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) if not possible`);
        const timeout = this.session.openvidu.advancedConfiguration.iceConnectionDisconnectedExceptionTimeout || 4000;
        this.awaitWebRtcPeerConnectionState(timeout).then(state => {
            switch (state) {
                case 'failed':
                    // Do nothing, as an ICE_CONNECTION_FAILED event will have already raised
                    logger.warn(`[ICE_CONNECTION_DISCONNECTED] ICE connection of stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) is now failed after ICE_CONNECTION_DISCONNECTED`);
                    break;
                case 'connected':
                case 'completed':
                    logger.log(`[ICE_CONNECTION_DISCONNECTED] ICE connection of stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) automatically restored after ICE_CONNECTION_DISCONNECTED. Current ICE connection state: ${state}`);
                    break;
                case 'closed':
                case 'checking':
                case 'new':
                case 'disconnected':
                    // Rest of states
                    logger.warn(`[ICE_CONNECTION_DISCONNECTED] ICE connection of stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) couldn't be restored after ICE_CONNECTION_DISCONNECTED event. Current ICE connection state after ${timeout} ms: ${state}`);
                    this.reconnectStreamAndLogResultingIceConnectionState(ExceptionEventName.ICE_CONNECTION_DISCONNECTED);
                    break;
            }
        });
    }

    private async reconnectStreamAndLogResultingIceConnectionState(event: string) {
        try {
            const finalIceStateAfterReconnection = await this.reconnectStreamAndReturnIceConnectionState(event);
            switch (finalIceStateAfterReconnection) {
                case 'connected':
                case 'completed':
                    logger.log(`[${event}] Stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) successfully reconnected after ${event}. Current ICE connection state: ${finalIceStateAfterReconnection}`);
                    break;
                default:
                    logger.error(`[${event}] Stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) failed to reconnect after ${event}. Current ICE connection state: ${finalIceStateAfterReconnection}`);
                    break;
            }
        } catch (error) {
            logger.error(`[${event}] Error reconnecting stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) after ${event}: ${error}`);
        }
    }

    private async reconnectStreamAndReturnIceConnectionState(event: string): Promise<RTCIceConnectionState> {
        logger.log(`[${event}] Reconnecting stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) after event ${event}`);
        try {
            await this.reconnectStream(event);
            const timeout = this.session.openvidu.advancedConfiguration.iceConnectionDisconnectedExceptionTimeout || 4000;
            return this.awaitWebRtcPeerConnectionState(timeout);
        } catch (error) {
            logger.warn(`[${event}] Error reconnecting stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}). Reason: ${error}`);
            return this.awaitWebRtcPeerConnectionState(1);
        }
    }

    private async reconnectStream(event: string) {
        const isWsConnected = await this.isWebsocketConnected(event, 3000);
        if (isWsConnected) {
            // There is connection to openvidu-server. The RTCPeerConnection is the only one broken
            logger.log(`[${event}] Trying to reconnect stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) and the websocket is opened`);
            if (this.isLocal()) {
                return this.initWebRtcPeerSend(true);
            } else {
                return this.initWebRtcPeerReceive(true);
            }
        } else {
            // There is no connection to openvidu-server. Nothing can be done. The automatic reconnection
            // feature should handle a possible reconnection of RTCPeerConnection in case network comes back
            const errorMsg = `[${event}] Trying to reconnect stream ${this.streamId} (${(this.isLocal() ? 'Publisher' : 'Subscriber')}) but the websocket wasn't opened`;
            logger.error(errorMsg);
            throw Error(errorMsg);
        }
    }

    private isWebsocketConnected(event: string, msResponseTimeout: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const wsReadyState = this.session.openvidu.getWsReadyState();
            if (wsReadyState === 1) {
                const responseTimeout = setTimeout(() => {
                    console.warn(`[${event}] Websocket timeout of ${msResponseTimeout}ms`);
                    resolve(false);
                }, msResponseTimeout);
                this.session.openvidu.sendRequest('echo', {}, (error, response) => {
                    clearTimeout(responseTimeout);
                    if (!!error) {
                        console.warn(`[${event}] Websocket 'echo' returned error: ${error}`);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            } else {
                console.warn(`[${event}] Websocket readyState is ${wsReadyState}`);
                resolve(false);
            }
        });
    }

    private async awaitWebRtcPeerConnectionState(timeout: number): Promise<RTCIceConnectionState> {
        let state = this.getRTCPeerConnection().iceConnectionState;
        const interval = 150;
        const intervals = Math.ceil(timeout / interval);
        for (let i = 0; i < intervals; i++) {
            state = this.getRTCPeerConnection().iceConnectionState;
            if (state === 'connected' || state === 'completed') {
                break;
            }
            // Sleep
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
        return state;
    }

    /**
     * @hidden
     */
    initWebRtcStats(): void {
        this.webRtcStats = new WebRtcStats(this);
        this.webRtcStats.initWebRtcStats();

        //TODO: send common webrtc stats from client to openvidu-server
        /*if (this.session.openvidu.webrtcStatsInterval > 0) {
            setInterval(() => {
                this.gatherStatsForPeer().then(jsonStats => {
                    const body = {
                        sessionId: this.session.sessionId,
                        participantPrivateId: this.connection.rpcSessionId,
                        stats: jsonStats
                    }
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', this.session.openvidu.httpUri + '/elasticsearch/webrtc-stats', true);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.send(JSON.stringify(body));
                })
            }, this.session.openvidu.webrtcStatsInterval * 1000);
        }*/
    }

    private stopWebRtcStats(): void {
        if (!!this.webRtcStats && this.webRtcStats.isEnabled()) {
            this.webRtcStats.stopWebRtcStats();
        }
    }

    private getIceServersConf(): RTCIceServer[] | undefined {
        let returnValue;
        if (!!this.session.openvidu.advancedConfiguration.iceServers) {
            returnValue = this.session.openvidu.advancedConfiguration.iceServers === 'freeice' ?
                undefined :
                this.session.openvidu.advancedConfiguration.iceServers;
        } else if (this.session.openvidu.iceServers) {
            returnValue = this.session.openvidu.iceServers;
        } else {
            returnValue = undefined;
        }
        return returnValue;
    }

    private gatherStatsForPeer(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.isLocal()) {

                // Publisher stream stats

                this.getRTCPeerConnection().getSenders().forEach(sender => sender.getStats()
                    .then(
                        response => {
                            response.forEach(report => {

                                if (this.isReportWanted(report)) {

                                    const finalReport = {};

                                    finalReport['type'] = report.type;
                                    finalReport['timestamp'] = report.timestamp;
                                    finalReport['id'] = report.id;

                                    // Common to Chrome, Firefox and Safari
                                    if (report.type === 'outbound-rtp') {
                                        finalReport['ssrc'] = report.ssrc;
                                        finalReport['firCount'] = report.firCount;
                                        finalReport['pliCount'] = report.pliCount;
                                        finalReport['nackCount'] = report.nackCount;
                                        finalReport['qpSum'] = report.qpSum;

                                        // Set media type
                                        if (!!report.kind) {
                                            finalReport['mediaType'] = report.kind;
                                        } else if (!!report.mediaType) {
                                            finalReport['mediaType'] = report.mediaType;
                                        } else {
                                            // Safari does not have 'mediaType' defined for inbound-rtp. Must be inferred from 'id' field
                                            finalReport['mediaType'] = (report.id.indexOf('VideoStream') !== -1) ? 'video' : 'audio';
                                        }

                                        if (finalReport['mediaType'] === 'video') {
                                            finalReport['framesEncoded'] = report.framesEncoded;
                                        }

                                        finalReport['packetsSent'] = report.packetsSent;
                                        finalReport['bytesSent'] = report.bytesSent;
                                    }

                                    // Only for Chrome and Safari
                                    if (report.type === 'candidate-pair' && report.totalRoundTripTime !== undefined) {
                                        // This is the final selected candidate pair
                                        finalReport['availableOutgoingBitrate'] = report.availableOutgoingBitrate;
                                        finalReport['rtt'] = report.currentRoundTripTime;
                                        finalReport['averageRtt'] = report.totalRoundTripTime / report.responsesReceived;
                                    }

                                    // Only for Firefox >= 66.0
                                    if (report.type === 'remote-inbound-rtp' || report.type === 'remote-outbound-rtp') {

                                    }

                                    logger.log(finalReport);
                                }
                            });
                        }));
            } else {

                // Subscriber stream stats

                this.getRTCPeerConnection().getReceivers().forEach(receiver => receiver.getStats()
                    .then(
                        response => {
                            response.forEach(report => {

                                if (this.isReportWanted(report)) {

                                    const finalReport = {};

                                    finalReport['type'] = report.type;
                                    finalReport['timestamp'] = report.timestamp;
                                    finalReport['id'] = report.id;

                                    // Common to Chrome, Firefox and Safari
                                    if (report.type === 'inbound-rtp') {
                                        finalReport['ssrc'] = report.ssrc;
                                        finalReport['firCount'] = report.firCount;
                                        finalReport['pliCount'] = report.pliCount;
                                        finalReport['nackCount'] = report.nackCount;
                                        finalReport['qpSum'] = report.qpSum;

                                        // Set media type
                                        if (!!report.kind) {
                                            finalReport['mediaType'] = report.kind;
                                        } else if (!!report.mediaType) {
                                            finalReport['mediaType'] = report.mediaType;
                                        } else {
                                            // Safari does not have 'mediaType' defined for inbound-rtp. Must be inferred from 'id' field
                                            finalReport['mediaType'] = (report.id.indexOf('VideoStream') !== -1) ? 'video' : 'audio';
                                        }

                                        if (finalReport['mediaType'] === 'video') {
                                            finalReport['framesDecoded'] = report.framesDecoded;
                                        }

                                        finalReport['packetsReceived'] = report.packetsReceived;
                                        finalReport['packetsLost'] = report.packetsLost;
                                        finalReport['jitter'] = report.jitter;
                                        finalReport['bytesReceived'] = report.bytesReceived;
                                    }

                                    // Only for Chrome and Safari
                                    if (report.type === 'candidate-pair' && report.totalRoundTripTime !== undefined) {
                                        // This is the final selected candidate pair
                                        finalReport['availableIncomingBitrate'] = report.availableIncomingBitrate;
                                        finalReport['rtt'] = report.currentRoundTripTime;
                                        finalReport['averageRtt'] = report.totalRoundTripTime / report.responsesReceived;
                                    }

                                    // Only for Firefox >= 66.0
                                    if (report.type === 'remote-inbound-rtp' || report.type === 'remote-outbound-rtp') {

                                    }
                                    logger.log(finalReport);
                                }
                            })
                        })
                )
            }
        });
    }

    private isReportWanted(report: any): boolean {
        return report.type === 'inbound-rtp' && !this.isLocal() ||
            report.type === 'outbound-rtp' && this.isLocal() ||
            (report.type === 'candidate-pair' && report.nominated && report.bytesSent > 0);
    }

}
