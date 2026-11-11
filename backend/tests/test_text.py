from app.text import chunk_text, estimate_seconds, normalize, number_to_words


def test_number_to_words():
    assert number_to_words(0) == "صفر"
    assert number_to_words(7) == "هفت"
    assert number_to_words(15) == "پانزده"
    assert number_to_words(21) == "بیست و یک"
    assert number_to_words(100) == "صد"
    assert number_to_words(1000) == "هزار"
    assert number_to_words(1402) == "هزار و چهارصد و دو"
    assert number_to_words(2_500_000) == "دو میلیون و پانصد هزار"
    assert number_to_words(1_000_000) == "یک میلیون"


def test_normalize_unifies_arabic_letters_and_question_mark():
    assert normalize("كتاب علي?") == "کتاب علی؟"


def test_normalize_spells_numbers_in_any_digit_script():
    assert normalize("سال ۱۴۰۲ بود.") == "سال هزار و چهارصد و دو بود."
    assert normalize("قیمت 2,500 تومان") == "قیمت دو هزار و پانصد تومان"
    assert normalize("رشد ۱۲٪ بود.") == "رشد دوازده درصد بود."
    assert normalize("عدد ۳٫۵ است.") == "عدد سه ممیز پنج است."
    assert normalize("شماره 0912") == "شماره صفر نه یک دو"


def test_normalize_can_keep_digits():
    assert normalize("سال 1402", spell_numbers=False) == "سال 1402"


def test_normalize_whitespace_and_emoji():
    assert normalize("سلام  ،   دنیا 🌍!") == "سلام، دنیا!"
    assert normalize("می ‌ خواهم") == "می‌خواهم"
    assert normalize("خط یک\n\n\n\nخط دو") == "خط یک\n\nخط دو"


def test_chunks_respect_limit_and_end_with_punctuation():
    text = "سلام! امروز هوا خیلی خوب است، بیا با هم به پارک برویم. آیا موافقی؟"
    chunks = [c.text for c in chunk_text(text, max_chars=40)]
    assert chunks == ["سلام! امروز هوا خیلی خوب است.", "بیا با هم به پارک برویم. آیا موافقی؟"]


def test_chunks_pack_short_sentences_together():
    chunks = chunk_text("یک. دو. سه.", max_chars=180)
    assert [c.text for c in chunks] == ["یک. دو. سه."]


def test_chunks_split_overlong_sentence_and_add_full_stop():
    sentence = "، ".join(["این یک جملهٔ بلند است"] * 20)
    chunks = chunk_text(sentence, max_chars=60)
    assert len(chunks) > 1
    assert all(len(c.text) <= 61 for c in chunks)
    assert all(c.text.endswith(".") for c in chunks)


def test_paragraph_breaks_are_marked():
    chunks = chunk_text("بند اول.\nبند دوم.", max_chars=180)
    assert [(c.text, c.paragraph_end) for c in chunks] == [("بند اول.", True), ("بند دوم.", False)]


def test_empty_and_punctuation_only_text():
    assert chunk_text("") == []
    assert chunk_text("...!") == []


def test_estimate_seconds():
    assert estimate_seconds("") == 0
    assert estimate_seconds("ا" * 130) == 10.0
