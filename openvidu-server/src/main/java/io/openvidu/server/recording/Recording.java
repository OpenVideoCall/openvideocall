package io.openvidu.server.recording;

import org.json.simple.JSONObject;

public class Recording {

	public enum Status {
		starting, // The recording is starting (cannot be stopped)
		started, // The recording has started and is going on
		stopped, // The recording has finished OK
		available, // The recording is available for downloading. This status is reached for all
								// stopped recordings if property 'openvidu.recording.free-access' is true
		failed; // The recording has failed
	}

	private Status status;

	private String id;
	private String name;
	private String sessionId;
	private long createdAt; // milliseconds (UNIX Epoch time)
	private long size = 0; // bytes
	private double duration = 0; // seconds
	private String url;
	private boolean hasAudio = true;
	private boolean hasVideo = true;

	public Recording(String sessionId, String id, String name) {
		this.sessionId = sessionId;
		this.createdAt = System.currentTimeMillis();
		this.id = id;
		this.name = id; // For now the name of the recording file is the same as its id
		this.status = Status.started;
	}

	public Recording(JSONObject json) {
		this.id = (String) json.get("id");
		this.name = (String) json.get("name");
		this.sessionId = (String) json.get("sessionId");
		this.createdAt = (long) json.get("createdAt");
		this.size = (long) json.get("size");
		this.duration = (double) json.get("duration");
		this.url = (String) json.get("url");
		this.hasAudio = (boolean) json.get("hasAudio");
		this.hasVideo = (boolean) json.get("hasVideo");
		this.status = Status.valueOf((String) json.get("status"));
	}

	public Status getStatus() {
		return status;
	}

	public void setStatus(Status status) {
		this.status = status;
	}

	public String getId() {
		return id;
	}

	public void setId(String id) {
		this.id = id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getSessionId() {
		return sessionId;
	}

	public void setSessionId(String sessionId) {
		this.sessionId = sessionId;
	}

	public long getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(long createdAt) {
		this.createdAt = createdAt;
	}

	public long getSize() {
		return size;
	}

	public void setSize(long l) {
		this.size = l;
	}

	public double getDuration() {
		return duration;
	}

	public void setDuration(double duration) {
		this.duration = duration;
	}

	public String getUrl() {
		return url;
	}

	public void setUrl(String url) {
		this.url = url;
	}

	public boolean hasAudio() {
		return hasAudio;
	}

	public void setHasAudio(boolean hasAudio) {
		this.hasAudio = hasAudio;
	}

	public boolean hasVideo() {
		return hasVideo;
	}

	public void setHasVideo(boolean hasVideo) {
		this.hasVideo = hasVideo;
	}

	@SuppressWarnings("unchecked")
	public JSONObject toJson() {
		JSONObject json = new JSONObject();
		json.put("id", this.id);
		json.put("name", this.name);
		json.put("sessionId", this.sessionId);
		json.put("createdAt", this.createdAt);
		json.put("size", this.size);
		json.put("duration", this.duration);
		json.put("url", this.url);
		json.put("hasAudio", this.hasAudio);
		json.put("hasVideo", this.hasVideo);
		json.put("status", this.status.toString());
		return json;
	}

}
