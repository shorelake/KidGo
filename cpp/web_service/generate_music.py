"""Render original, sample-free children's music and its browser catalog."""
import json
import math
import struct
import wave
from pathlib import Path

RATE = 22050
SONGS = [
    {"id":"little-steps","title":"小小步伐","tempo":104,"meter":4,"timbre":"bell",
     "melody":[[72,76,79,76,74,76,72,None,69,72,76,79,76,74,72,None],
               [76,79,81,79,76,74,72,None,74,76,79,76,74,72,69,None],
               [72,74,76,79,81,79,76,None,79,76,74,72,69,72,74,None],
               [76,79,76,74,72,69,72,None,74,76,74,69,72,None,None,None]],
     "chords":[[48,55,60,64],[45,52,57,60],[53,60,65,69],[55,62,67,71]]},
    {"id":"bubble-waltz","title":"泡泡圆舞曲","tempo":116,"meter":3,"timbre":"pluck",
     "melody":[[74,78,81,83,81,78,76,78,74,71,74,None],
               [78,81,83,86,83,81,78,76,74,76,78,None],
               [83,81,78,81,78,76,74,76,78,71,74,None],
               [78,81,78,76,74,71,74,78,76,74,None,None]],
     "chords":[[50,57,62,66],[47,54,59,62],[55,62,67,71],[57,64,69,73]]},
    {"id":"sunny-path","title":"阳光小路","tempo":112,"meter":4,"timbre":"marimba",
     "melody":[[67,71,74,None,76,74,71,69,67,69,71,None,74,71,67,None],
               [71,74,76,79,76,None,74,71,69,71,74,None,71,69,67,None],
               [76,74,71,74,71,69,67,None,69,71,74,76,74,71,69,None],
               [74,71,69,67,64,67,71,None,69,71,69,64,67,None,None,None]],
     "chords":[[43,50,55,59],[40,47,52,55],[48,55,60,64],[50,57,62,66]]},
    {"id":"cotton-clouds","title":"棉花云朵","tempo":92,"meter":3,"timbre":"soft",
     "melody":[[69,72,76,79,76,72,74,72,69,67,69,None],
               [72,76,79,81,79,76,74,76,72,69,72,None],
               [76,74,72,69,72,74,76,79,76,74,72,None],
               [72,69,67,64,67,69,72,74,69,72,None,None]],
     "chords":[[45,52,57,60],[41,48,53,57],[48,55,60,64],[43,50,55,59]]},
]


def render(destination, song):
    beat = 60 / song["tempo"]
    meter = song["meter"]
    duration = 16 * meter * beat
    count = round(duration * RATE)
    samples = [0.0] * count

    def note(at, midi, length, gain, timbre="bass"):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        offset = round(at * beat * RATE)
        seconds = length * beat
        decay = {"bass":2.5,"bell":5,"pluck":4.5,"marimba":6,"soft":2.8}[timbre]
        for i in range(round(seconds * RATE)):
            t = i / RATE
            envelope = min(1,t/.014) * min(1,max(0,(seconds-t)/.08)) * math.exp(-t*decay)
            phase = 2 * math.pi * frequency * t
            signal = math.sin(phase)
            if timbre == "bell":
                signal += .23*math.sin(phase*2)*math.exp(-t*7) + .08*math.sin(phase*3)*math.exp(-t*10)
            elif timbre == "pluck":
                signal += .3*math.sin(phase*2)*math.exp(-t*5) + .12*math.sin(phase*4)*math.exp(-t*8)
            elif timbre == "marimba":
                signal += .2*math.sin(phase*4)*math.exp(-t*16)
            elif timbre == "soft":
                signal += .1*math.sin(phase*2)*math.exp(-t*4)
            # Circular mixing preserves the release tails across the loop seam.
            samples[(offset+i)%count] += gain*envelope*signal

    for bar in range(16):
        chord = song["chords"][bar%4]
        note(bar*meter,chord[0],min(2.6,meter-.2),.11)
        for i,pitch in enumerate(chord[1:]):
            note(bar*meter+.5+i*(meter-1)/3,pitch,1.2,.045,song["timbre"])
        phrase = song["melody"][bar//4]
        for b in range(meter):
            pitch = phrase[(bar%4)*meter+b]
            if pitch is not None:
                note(bar*meter+b,pitch,.9,.14,song["timbre"])
    peak = max(abs(x) for x in samples)
    destination.parent.mkdir(parents=True,exist_ok=True)
    with wave.open(str(destination),"wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b"".join(struct.pack("<h",round(sample/peak*20000)) for sample in samples))
    print(f"Generated {destination.name}: {duration:.2f}s, {song['tempo']} BPM")
    return round(duration,2)


if __name__ == "__main__":
    root = Path(__file__).parent / "frontend/public/music"
    catalog = []
    for song in SONGS:
        file = song["id"] + ".wav"
        duration = render(root/file,song)
        catalog.append({"id":song["id"],"title":song["title"],"file":file,"duration":duration})
    (root/"tracks.json").write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
