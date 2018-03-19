package io.openvidu.java.client;

import org.json.simple.JSONObject;

public class Archive {

	public enum Status {
		starting, // The recording is starting (cannot be stopped)
		started, // The recording has started and is going on
		stopped, // The recording has finished OK
		available, // The recording is available for downloading. This status is reached for all
					// stopped recordings if property 'openvidu.recording.free-access' is true
		failed; // The recording has failed
	}

	private Archive.Status status;

	private String id;
	private String name;
	private String sessionId;
	private long createdAt; // milliseconds (UNIX Epoch time)
	private long size = 0; // bytes
	private double duration = 0; // seconds
	private String url;
	private boolean hasAudio = true;
	private boolean hasVideo = true;

	public Archive(JSONObject json) {
		this.id = (String) json.get("id");
		this.name = (String) json.get("name");
		this.sessionId = (String) json.get("sessionId");
		this.createdAt = (long) json.get("createdAt");
		this.size = (long) json.get("size");
		this.duration = (double) json.get("duration");
		this.url = (String) json.get("url");
		this.hasAudio = (boolean) json.get("hasAudio");
		this.hasVideo = (boolean) json.get("hasVideo");
		this.status = Archive.Status.valueOf((String) json.get("status"));
	}

	public Archive.Status getStatus() {
		return status;
	}

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getSessionId() {
		return sessionId;
	}

	public long getCreatedAt() {
		return createdAt;
	}

	public long getSize() {
		return size;
	}

	public double getDuration() {
		return duration;
	}

	public String getUrl() {
		return url;
	}

	public boolean hasAudio() {
		return hasAudio;
	}

	public boolean hasVideo() {
		return hasVideo;
	}

}
