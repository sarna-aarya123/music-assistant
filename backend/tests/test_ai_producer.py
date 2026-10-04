from app.services.ai_producer import find_unverified_claims, find_unverified_numbers

FACTS = "Loudness: -12.4 dB\nBrightness: 2140 Hz\nOnset density: 3.2 per second\nSection 2, 0:48 to 1:30"


def test_grounded_numbers_pass():
    reply = "At -12.4 dB and 2140 Hz this is brighter, with 3.2 hits per second from 0:48."
    assert find_unverified_numbers(reply, FACTS) == []


def test_rounding_is_tolerated():
    assert find_unverified_numbers("Roughly 2150 Hz and about 3.2 onsets", FACTS) == []


def test_invented_number_is_flagged():
    assert find_unverified_numbers("Sits at 140 BPM with 85% low end", FACTS) == ["140", "85"]


def test_small_counts_ignored():
    assert find_unverified_numbers("Try 3 changes in section 2", FACTS) == []


def test_unmeasured_musical_claims_are_flagged():
    flagged = find_unverified_claims("The E minor chord adds depth", FACTS + "\nkey E major")
    assert flagged == ["E minor"]


def test_whole_track_key_is_allowed():
    assert find_unverified_claims("Sits nicely in E major", FACTS + "\nkey E major") == []
