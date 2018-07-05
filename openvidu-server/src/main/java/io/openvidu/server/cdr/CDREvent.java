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

package io.openvidu.server.cdr;

import org.json.simple.JSONObject;

import io.openvidu.java.client.RecordingLayout;
import io.openvidu.server.core.MediaOptions;
import io.openvidu.server.core.Participant;
import io.openvidu.server.recording.Recording;

public class CDREvent implements Comparable<CDREvent> {

	protected CDREventName eventName;
	protected String sessionId;
	protected Long timeStamp;
	private Long startTime;
	private Integer duration;
	private Participant participant;
	private MediaOptions mediaOptions;
	private String receivingFrom;
	private String reason;
	
	// Recording events
	private Long size;
	private String id;
	private String name;
	private Boolean hasAudio;
	private Boolean hasVideo;
	private RecordingLayout recordingLayout;

	public CDREvent(CDREventName eventName, CDREvent event) {
		this(eventName, event.participant, event.sessionId, event.mediaOptions, event.receivingFrom, event.startTime, event.reason);
		this.duration = (int) (this.timeStamp - this.startTime / 1000);
	}
	
	public CDREvent(CDREventName eventName, CDREvent event, String reason) {
		this(eventName, event.participant, event.sessionId, event.mediaOptions, event.receivingFrom, event.startTime, reason);
		this.duration = (int) (this.timeStamp - this.startTime / 1000);
	}

	public CDREvent(CDREventName eventName, String sessionId) {
		this.eventName = eventName;
		if ((sessionId.indexOf('/')) != -1) {
			this.sessionId = sessionId.substring(sessionId.lastIndexOf('/') + 1, sessionId.length());
		} else {
			this.sessionId = sessionId;
		}
		this.timeStamp = System.currentTimeMillis();
		this.startTime = this.timeStamp;
	}
	
	public CDREvent(CDREventName eventName, String sessionId, Recording recording) {
		this.eventName = eventName;
		if ((sessionId.indexOf('/')) != -1) {
			this.sessionId = sessionId.substring(sessionId.lastIndexOf('/') + 1, sessionId.length());
		} else {
			this.sessionId = sessionId;
		}
		this.timeStamp = System.currentTimeMillis();
		this.id = recording.getId();
		this.name = recording.getName();
		this.duration = (int) recording.getDuration();
		this.size = recording.getSize();
		this.hasAudio = recording.hasAudio();
		this.hasVideo = recording.hasVideo();
		this.recordingLayout = recording.getRecordingLayout();
	}

	public CDREvent(CDREventName eventName, Participant participant, String sessionId) {
		this(eventName, sessionId);
		this.participant = participant;
		this.startTime = this.timeStamp;
	}

	public CDREvent(CDREventName eventName, Participant participant, String sessionId, MediaOptions mediaOptions,
			String receivingFrom, Long startTime, String reason) {
		this(eventName, sessionId);
		this.participant = participant;
		this.mediaOptions = mediaOptions;
		this.receivingFrom = receivingFrom;
		this.startTime = startTime;
		this.reason = reason;
	}

	public MediaOptions getMediaOptions() {
		return mediaOptions;
	}

	public String getParticipantPublicId() {
		return this.participant.getParticipantPublicId();
	}

	public String getReceivingFrom() {
		return this.receivingFrom;
	}

	@Override
	@SuppressWarnings("unchecked")
	public String toString() {
		JSONObject json = new JSONObject();
		json.put("sessionId", this.sessionId);
		json.put("timestamp", this.timeStamp);

		if (this.participant != null) {
			json.put("participantId", this.participant.getParticipantPublicId());
		}
		if (this.mediaOptions != null) {
			json.put("connection", this.receivingFrom != null ? "INBOUND" : "OUTBOUND");
			json.put("audioEnabled", this.mediaOptions.hasAudio());
			json.put("videoEnabled", this.mediaOptions.hasVideo());
			if (this.mediaOptions.hasVideo()) {
				json.put("videoSource", this.mediaOptions.getTypeOfVideo());
				json.put("videoFramerate", this.mediaOptions.getFrameRate());
			}
			if (this.receivingFrom != null) {
				json.put("receivingFrom", this.receivingFrom);
			}
		}
		if (this.startTime != null && this.duration != null) {
			json.put("startTime", this.startTime);
			json.put("endTime", this.timeStamp);
			json.put("duration", (this.timeStamp - this.startTime) / 1000);
		} else if (this.duration != null) {
			json.put("duration", duration);
		}
		if (this.reason != null) {
			json.put("reason", this.reason);
		}
		if (this.id != null) {
			json.put("id", this.id);
		}
		if (this.name != null) {
			json.put("name", this.name);
		}
		if (this.size != null) {
			json.put("size", this.size);
		}
		if (this.hasAudio != null) {
			json.put("hasAudio", this.hasAudio);
		}
		if (this.hasVideo != null) {
			json.put("hasVideo", this.hasVideo);
		}
		if (this.recordingLayout != null) {
			json.put("recordingLayout", this.recordingLayout.name());
		}

		JSONObject root = new JSONObject();
		root.put(this.eventName.name(), json);

		return root.toJSONString();
	}

	@Override
	public int compareTo(CDREvent other) {
		if (this.participant.equals(other.participant)) {
			if (this.receivingFrom != null && other.receivingFrom != null) {
				if (this.receivingFrom.equals(other.receivingFrom)) {
					return 0;
				} else {
					return 1;
				}
			} else {
				if (this.receivingFrom == null && other.receivingFrom == null) {
					return 0;
				} else {
					return 1;
				}
			}
		}
		return 1;
	}

}
