package org.example.traveljava.util;

import jakarta.servlet.http.HttpServletRequest;
import org.example.traveljava.entity.Note;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 视频分享落地页：给微信/爬虫看 og 标签，真人再跳回 H5。 */
public final class NoteShareHtml {

    private static final Pattern VIDEO_SRC = Pattern.compile(
            "(?i)<(?:video|source)[^>]*src=[\"']([^\"']+)[\"']");
    private static final Pattern VIDEO_FILE = Pattern.compile("(?i)\\.(mp4|webm|mov)(\\?|$)");

    private NoteShareHtml() {}

    public static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    public static String origin(HttpServletRequest req) {
        String proto = first(req.getHeader("X-Forwarded-Proto"), req.getScheme());
        String host = first(req.getHeader("X-Forwarded-Host"), first(req.getHeader("Host"), "localhost"));
        int comma = host.indexOf(',');
        if (comma >= 0) host = host.substring(0, comma).trim();
        return proto + "://" + host;
    }

    public static String abs(String origin, String path) {
        if (path == null || path.isBlank()) return "";
        String p = path.trim();
        if (p.startsWith("http://") || p.startsWith("https://")) return p;
        if (p.startsWith("//")) return "https:" + p;
        if (!p.startsWith("/")) p = "/" + p;
        return origin + p;
    }

    public static String videoSrc(Note note) {
        if (note == null) return "";
        String cover = note.getCover();
        if (cover != null && VIDEO_FILE.matcher(cover).find()) return cover;
        String content = note.getContent() == null ? "" : note.getContent();
        Matcher m = VIDEO_SRC.matcher(content);
        return m.find() ? m.group(1) : "";
    }

    public static String imageSrc(Note note) {
        if (note == null) return "";
        String cover = note.getCover();
        if (cover == null || cover.isBlank() || VIDEO_FILE.matcher(cover).find()) return "";
        return cover;
    }

    public static String render(Note note, String origin) {
        String id = String.valueOf(note.getId());
        String title = esc(note.getTitle() == null || note.getTitle().isBlank() ? "视频" : note.getTitle());
        String video = abs(origin, videoSrc(note));
        String image = abs(origin, imageSrc(note));
        String play = origin + "/#/video-detail?id=" + id;
        String card = origin + "/api/notes/" + id + "/card";
        String ogVideo = video.isEmpty() ? "" : "<meta property=\"og:video\" content=\"" + esc(video) + "\">";
        String ogImage = image.isEmpty() ? "" : "<meta property=\"og:image\" content=\"" + esc(image) + "\">";
        String player = video.isEmpty() ? "" : "<video src=\"" + esc(video) + "\" controls playsinline style=\"width:100%;max-height:100vh;background:#000\"></video>";
        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>" + title + "</title>"
                + "<meta property=\"og:type\" content=\"video.other\">"
                + "<meta property=\"og:title\" content=\"" + title + "\">"
                + "<meta property=\"og:url\" content=\"" + esc(card) + "\">"
                + ogVideo + ogImage
                + "</head><body style=\"margin:0;background:#000;color:#fff\">"
                + player
                + "<p style=\"padding:16px\"><a href=\"" + esc(play) + "\" style=\"color:#fff\">打开视频</a></p>"
                + "<script>location.replace(" + json(play) + ")</script>"
                + "</body></html>";
    }

    private static String json(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String first(String a, String b) {
        return (a == null || a.isBlank()) ? b : a.trim();
    }
}
