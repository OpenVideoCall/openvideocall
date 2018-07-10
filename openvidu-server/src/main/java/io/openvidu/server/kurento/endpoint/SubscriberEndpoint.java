/*
 * (C) Copyright 2017-2018 OpenVidu (https://openvidu.io/)
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

package io.openvidu.server.kurento.endpoint;

import org.json.simple.JSONObject;
import org.kurento.client.MediaPipeline;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.server.config.OpenviduConfig;
import io.openvidu.server.kurento.core.KurentoParticipant;

/**
 * Subscriber aspect of the {@link MediaEndpoint}.
 *
 * @author <a href="mailto:rvlad@naevatec.com">Radu Tom Vlad</a>
 */
public class SubscriberEndpoint extends MediaEndpoint {
	private final static Logger log = LoggerFactory.getLogger(SubscriberEndpoint.class);

	private boolean connectedToPublisher = false;

	private PublisherEndpoint publisher = null;

	public SubscriberEndpoint(boolean web, KurentoParticipant owner, String endpointName, MediaPipeline pipeline, OpenviduConfig openviduConfig) {
		super(web, owner, endpointName, pipeline, openviduConfig, log);
	}

	public synchronized String subscribe(String sdpOffer, PublisherEndpoint publisher) {
		registerOnIceCandidateEventListener();
		String sdpAnswer = processOffer(sdpOffer);
		gatherCandidates();
		publisher.connect(this.getEndpoint());
		setConnectedToPublisher(true);
		setPublisher(publisher);
		return sdpAnswer;
	}

	public boolean isConnectedToPublisher() {
		return connectedToPublisher;
	}

	public void setConnectedToPublisher(boolean connectedToPublisher) {
		this.connectedToPublisher = connectedToPublisher;
	}

	@Override
	public PublisherEndpoint getPublisher() {
		return this.publisher;
	}

	public void setPublisher(PublisherEndpoint publisher) {
		this.publisher = publisher;
	}

	@SuppressWarnings("unchecked")
	@Override
	public JSONObject toJSON() {
		JSONObject json = super.toJSON();
		json.put("streamId", this.publisher.getEndpoint().getTag("name"));
		json.put("publisher", this.publisher.getEndpointName());
		return json;
	}

	@SuppressWarnings("unchecked")
	@Override
	public JSONObject withStatsToJSON() {
		JSONObject json = super.withStatsToJSON();
		JSONObject toJSON = this.toJSON();
		for (Object key : toJSON.keySet()) {
			json.put(key, toJSON.get(key));
		}
		return json;
	}
}
