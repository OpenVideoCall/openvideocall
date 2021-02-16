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

// tslint:disable:no-string-literal

import { Stream } from '../../OpenVidu/Stream';
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

export class WebRtcStats {

    private webRtcStatsEnabled = false;
    private webRtcStatsIntervalId: NodeJS.Timer;
    private statsInterval = 1;
    private stats: any = {
        inbound: {
            audio: {
                bytesReceived: 0,
                packetsReceived: 0,
                packetsLost: 0
            },
            video: {
                bytesReceived: 0,
                packetsReceived: 0,
                packetsLost: 0,
                framesDecoded: 0,
                nackCount: 0
            }
        },
        outbound: {
            audio: {
                bytesSent: 0,
                packetsSent: 0,
            },
            video: {
                bytesSent: 0,
                packetsSent: 0,
                framesEncoded: 0,
                nackCount: 0
            }
        }
    };

    constructor(private stream: Stream) {
        platform = PlatformUtils.getInstance();
    }

    public isEnabled(): boolean {
        return this.webRtcStatsEnabled;
    }

    public initWebRtcStats(): void {

        const elastestInstrumentation = localStorage.getItem('elastest-instrumentation');

        if (!!elastestInstrumentation) {
            // ElasTest instrumentation object found in local storage

            logger.warn('WebRtc stats enabled for stream ' + this.stream.streamId + ' of connection ' + this.stream.connection.connectionId);

            this.webRtcStatsEnabled = true;

            const instrumentation = JSON.parse(elastestInstrumentation);
            this.statsInterval = instrumentation.webrtc.interval;  // Interval in seconds

            logger.warn('localStorage item: ' + JSON.stringify(instrumentation));

            this.webRtcStatsIntervalId = setInterval(() => {
                this.sendStatsToHttpEndpoint(instrumentation);
            }, this.statsInterval * 1000);

            return;
        }

        logger.debug('WebRtc stats not enabled');
    }

    public stopWebRtcStats() {
        if (this.webRtcStatsEnabled) {
            clearInterval(this.webRtcStatsIntervalId);
            logger.warn('WebRtc stats stopped for disposed stream ' + this.stream.streamId + ' of connection ' + this.stream.connection.connectionId);
        }
    }

    public getSelectedIceCandidateInfo(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.getStatsAgnostic(this.stream.getRTCPeerConnection(),
                (stats) => {
                    if (platform.isChromeBrowser() || platform.isChromeMobileBrowser() || platform.isOperaBrowser() || platform.isOperaMobileBrowser()) {
                        let localCandidateId, remoteCandidateId, googCandidatePair;
                        const localCandidates = {};
                        const remoteCandidates = {};
                        for (const key in stats) {
                            const stat = stats[key];
                            if (stat.type === 'localcandidate') {
                                localCandidates[stat.id] = stat;
                            } else if (stat.type === 'remotecandidate') {
                                remoteCandidates[stat.id] = stat;
                            } else if (stat.type === 'googCandidatePair' && (stat.googActiveConnection === 'true')) {
                                googCandidatePair = stat;
                                localCandidateId = stat.localCandidateId;
                                remoteCandidateId = stat.remoteCandidateId;
                            }
                        }
                        let finalLocalCandidate = localCandidates[localCandidateId];
                        if (!!finalLocalCandidate) {
                            const candList = this.stream.getLocalIceCandidateList();
                            const cand = candList.filter((c: RTCIceCandidate) => {
                                return (!!c.candidate &&
                                    c.candidate.indexOf(finalLocalCandidate.ipAddress) >= 0 &&
                                    c.candidate.indexOf(finalLocalCandidate.portNumber) >= 0 &&
                                    c.candidate.indexOf(finalLocalCandidate.priority) >= 0);
                            });
                            finalLocalCandidate.raw = !!cand[0] ? cand[0].candidate : 'ERROR: Cannot find local candidate in list of sent ICE candidates';
                        } else {
                            finalLocalCandidate = 'ERROR: No active local ICE candidate. Probably ICE-TCP is being used';
                        }

                        let finalRemoteCandidate = remoteCandidates[remoteCandidateId];
                        if (!!finalRemoteCandidate) {
                            const candList = this.stream.getRemoteIceCandidateList();
                            const cand = candList.filter((c: RTCIceCandidate) => {
                                return (!!c.candidate &&
                                    c.candidate.indexOf(finalRemoteCandidate.ipAddress) >= 0 &&
                                    c.candidate.indexOf(finalRemoteCandidate.portNumber) >= 0 &&
                                    c.candidate.indexOf(finalRemoteCandidate.priority) >= 0);
                            });
                            finalRemoteCandidate.raw = !!cand[0] ? cand[0].candidate : 'ERROR: Cannot find remote candidate in list of received ICE candidates';
                        } else {
                            finalRemoteCandidate = 'ERROR: No active remote ICE candidate. Probably ICE-TCP is being used';
                        }

                        resolve({
                            googCandidatePair,
                            localCandidate: finalLocalCandidate,
                            remoteCandidate: finalRemoteCandidate
                        });
                    } else {
                        reject('Selected ICE candidate info only available for Chrome');
                    }
                },
                (error) => {
                    reject(error);
                });
        });
    }

    private sendStatsToHttpEndpoint(instrumentation): void {

        const sendPost = (json) => {
            const http: XMLHttpRequest = new XMLHttpRequest();
            const url: string = instrumentation.webrtc.httpEndpoint;
            http.open('POST', url, true);

            http.setRequestHeader('Content-type', 'application/json');

            http.onreadystatechange = () => { // Call a function when the state changes.
                if (http.readyState === 4 && http.status === 200) {
                    logger.log('WebRtc stats successfully sent to ' + url + ' for stream ' + this.stream.streamId + ' of connection ' + this.stream.connection.connectionId);
                }
            };
            http.send(json);
        };

        const f = (stats) => {

            if (platform.isFirefoxBrowser() || platform.isFirefoxMobileBrowser()) {
                stats.forEach((stat) => {

                    let json = {};

                    if ((stat.type === 'inbound-rtp') &&
                        (
                            // Avoid firefox empty outbound-rtp statistics
                            stat.nackCount !== null
                        )) {

                        const metricId = 'webrtc_inbound_' + stat.mediaType + '_' + stat.ssrc;
                        const jit = stat.jitter * 1000;

                        const metrics = {
                            bytesReceived: (stat.bytesReceived - this.stats.inbound[stat.mediaType].bytesReceived) / this.statsInterval,
                            jitter: jit,
                            packetsReceived: (stat.packetsReceived - this.stats.inbound[stat.mediaType].packetsReceived) / this.statsInterval,
                            packetsLost: (stat.packetsLost - this.stats.inbound[stat.mediaType].packetsLost) / this.statsInterval
                        };
                        const units = {
                            bytesReceived: 'bytes',
                            jitter: 'ms',
                            packetsReceived: 'packets',
                            packetsLost: 'packets'
                        };
                        if (stat.mediaType === 'video') {
                            metrics['framesDecoded'] = (stat.framesDecoded - this.stats.inbound.video.framesDecoded) / this.statsInterval;
                            metrics['nackCount'] = (stat.nackCount - this.stats.inbound.video.nackCount) / this.statsInterval;
                            units['framesDecoded'] = 'frames';
                            units['nackCount'] = 'packets';

                            this.stats.inbound.video.framesDecoded = stat.framesDecoded;
                            this.stats.inbound.video.nackCount = stat.nackCount;
                        }

                        this.stats.inbound[stat.mediaType].bytesReceived = stat.bytesReceived;
                        this.stats.inbound[stat.mediaType].packetsReceived = stat.packetsReceived;
                        this.stats.inbound[stat.mediaType].packetsLost = stat.packetsLost;

                        json = {
                            '@timestamp': new Date(stat.timestamp).toISOString(),
                            'exec': instrumentation.exec,
                            'component': instrumentation.component,
                            'stream': 'webRtc',
                            'et_type': metricId,
                            'stream_type': 'composed_metrics',
                            'units': units
                        };
                        json[metricId] = metrics;

                        sendPost(JSON.stringify(json));

                    } else if (stat.type === 'outbound-rtp'){

                        const metricId = 'webrtc_outbound_' + stat.mediaType + '_' + stat.ssrc;

                        const metrics = {
                            bytesSent: (stat.bytesSent - this.stats.outbound[stat.mediaType].bytesSent) / this.statsInterval,
                            packetsSent: (stat.packetsSent - this.stats.outbound[stat.mediaType].packetsSent) / this.statsInterval
                        };
                        const units = {
                            bytesSent: 'bytes',
                            packetsSent: 'packets'
                        };
                        if (stat.mediaType === 'video') {
                            metrics['framesEncoded'] = (stat.framesEncoded - this.stats.outbound.video.framesEncoded) / this.statsInterval;
                            units['framesEncoded'] = 'frames';

                            this.stats.outbound.video.framesEncoded = stat.framesEncoded;
                        }

                        this.stats.outbound[stat.mediaType].bytesSent = stat.bytesSent;
                        this.stats.outbound[stat.mediaType].packetsSent = stat.packetsSent;

                        json = {
                            '@timestamp': new Date(stat.timestamp).toISOString(),
                            'exec': instrumentation.exec,
                            'component': instrumentation.component,
                            'stream': 'webRtc',
                            'et_type': metricId,
                            'stream_type': 'composed_metrics',
                            'units': units
                        };
                        json[metricId] = metrics;

                        sendPost(JSON.stringify(json));
                    }
                });
            } else if (platform.isChromeBrowser() || platform.isChromeMobileBrowser() || platform.isOperaBrowser() || platform.isOperaMobileBrowser()) {
                for (const key of Object.keys(stats)) {
                    const stat = stats[key];
                    if (stat.type === 'ssrc') {

                        let json = {};

                        if ('bytesReceived' in stat && (
                            (stat.mediaType === 'audio' && 'audioOutputLevel' in stat) ||
                            (stat.mediaType === 'video' && 'qpSum' in stat)
                        )) {
                            // inbound-rtp
                            const metricId = 'webrtc_inbound_' + stat.mediaType + '_' + stat.ssrc;

                            const metrics = {
                                bytesReceived: (stat.bytesReceived - this.stats.inbound[stat.mediaType].bytesReceived) / this.statsInterval,
                                jitter: stat.googJitterBufferMs,
                                packetsReceived: (stat.packetsReceived - this.stats.inbound[stat.mediaType].packetsReceived) / this.statsInterval,
                                packetsLost: (stat.packetsLost - this.stats.inbound[stat.mediaType].packetsLost) / this.statsInterval
                            };
                            const units = {
                                bytesReceived: 'bytes',
                                jitter: 'ms',
                                packetsReceived: 'packets',
                                packetsLost: 'packets'
                            };
                            if (stat.mediaType === 'video') {
                                metrics['framesDecoded'] = (stat.framesDecoded - this.stats.inbound.video.framesDecoded) / this.statsInterval;
                                metrics['nackCount'] = (stat.googNacksSent - this.stats.inbound.video.nackCount) / this.statsInterval;
                                units['framesDecoded'] = 'frames';
                                units['nackCount'] = 'packets';

                                this.stats.inbound.video.framesDecoded = stat.framesDecoded;
                                this.stats.inbound.video.nackCount = stat.googNacksSent;
                            }

                            this.stats.inbound[stat.mediaType].bytesReceived = stat.bytesReceived;
                            this.stats.inbound[stat.mediaType].packetsReceived = stat.packetsReceived;
                            this.stats.inbound[stat.mediaType].packetsLost = stat.packetsLost;

                            json = {
                                '@timestamp': new Date(stat.timestamp).toISOString(),
                                'exec': instrumentation.exec,
                                'component': instrumentation.component,
                                'stream': 'webRtc',
                                'et_type': metricId,
                                'stream_type': 'composed_metrics',
                                'units': units
                            };
                            json[metricId] = metrics;

                            sendPost(JSON.stringify(json));
                        } else if ('bytesSent' in stat) {
                            // outbound-rtp
                            const metricId = 'webrtc_outbound_' + stat.mediaType + '_' + stat.ssrc;

                            const metrics = {
                                bytesSent: (stat.bytesSent - this.stats.outbound[stat.mediaType].bytesSent) / this.statsInterval,
                                packetsSent: (stat.packetsSent - this.stats.outbound[stat.mediaType].packetsSent) / this.statsInterval
                            };
                            const units = {
                                bytesSent: 'bytes',
                                packetsSent: 'packets'
                            };
                            if (stat.mediaType === 'video') {
                                metrics['framesEncoded'] = (stat.framesEncoded - this.stats.outbound.video.framesEncoded) / this.statsInterval;
                                units['framesEncoded'] = 'frames';

                                this.stats.outbound.video.framesEncoded = stat.framesEncoded;
                            }

                            this.stats.outbound[stat.mediaType].bytesSent = stat.bytesSent;
                            this.stats.outbound[stat.mediaType].packetsSent = stat.packetsSent;

                            json = {
                                '@timestamp': new Date(stat.timestamp).toISOString(),
                                'exec': instrumentation.exec,
                                'component': instrumentation.component,
                                'stream': 'webRtc',
                                'et_type': metricId,
                                'stream_type': 'composed_metrics',
                                'units': units
                            };
                            json[metricId] = metrics;

                            sendPost(JSON.stringify(json));
                        }
                    }
                }
            }
        };

        this.getStatsAgnostic(this.stream.getRTCPeerConnection(), f, (error) => { logger.log(error); });
    }

    private standardizeReport(response) {
        logger.log(response);
        const standardReport = {};

        if (platform.isFirefoxBrowser() || platform.isFirefoxMobileBrowser()) {
            Object.keys(response).forEach(key => {
                logger.log(response[key]);
            });
            return response;
        }

        response.result().forEach(report => {
            const standardStats = {
                id: report.id,
                timestamp: report.timestamp,
                type: report.type
            };
            report.names().forEach((name) => {
                standardStats[name] = report.stat(name);
            });
            standardReport[standardStats.id] = standardStats;
        });

        return standardReport;
    }

    private getStatsAgnostic(pc, successCb, failureCb) {
        if (platform.isFirefoxBrowser() || platform.isFirefoxMobileBrowser()) {
            // getStats takes args in different order in Chrome and Firefox
            return pc.getStats(null).then(response => {
                const report = this.standardizeReport(response);
                successCb(report);
            }).catch(failureCb);
        } else if (platform.isChromeBrowser() || platform.isChromeMobileBrowser() || platform.isOperaBrowser() || platform.isOperaMobileBrowser()) {
            // In Chrome, the first two arguments are reversed
            return pc.getStats((response) => {
                const report = this.standardizeReport(response);
                successCb(report);
            }, null, failureCb);
        }
    }

}