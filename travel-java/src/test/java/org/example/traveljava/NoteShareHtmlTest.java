package org.example.traveljava;

import org.example.traveljava.entity.Note;
import org.example.traveljava.util.NoteShareHtml;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NoteShareHtmlTest {

    @Test
    void renderPutsOgVideoAndEscapesTitle() {
        Note note = new Note();
        note.setId(6L);
        note.setTitle("深圳<script>");
        note.setCover("");
        note.setContent("1<video src=\"/uploads/a.mp4\"></video>");
        String html = NoteShareHtml.render(note, "http://8.148.223.54");
        assertThat(html).contains("og:video");
        assertThat(html).contains("http://8.148.223.54/uploads/a.mp4");
        assertThat(html).contains("/#/video-detail?id=6");
        assertThat(html).contains("深圳&lt;script&gt;");
        assertThat(html).doesNotContain("<script>alert");
    }
}
