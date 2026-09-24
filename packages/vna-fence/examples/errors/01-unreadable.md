# 読めなかったときに何が出るか

読めなかった行は図の下の帯に、**行番号と、その行の中身と、綴りを指す印**つきで
出る。枠は必ず描く (読めた所まで)。

掃引の終わりが始めより下。

```vna
sweep: 300M-1M 101
dut: series R 100
```

実機は S22 を測らない (治具を裏返して S11 で測る)。

```vna
sweep: 1M-300M
dut: series R 100
traces:
  - S22 logmag
```

コンデンサの値に接頭辞が無い (47 F になる)。

```vna
sweep: 1M-300M
dut: shunt C 47
```

`data:` には道を書けない (.md と同じ場所のファイルだけ)。

```vna
sweep: 1M-300M
data: ../secret/x.s2p
```
