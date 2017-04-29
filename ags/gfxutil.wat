(module
  (import "memory" "main" (memory 0))
  (func $ensure_memory_reach (param $end i32)
    ;; transform byte offset to page delta and do nothing if it's <= 0
    (if (i32.gt_s (tee_local $end (i32.sub (current_memory) (i32.div_u (get_local $end) (i32.const 65536)))) (i32.const 0))
      (drop (grow_memory (get_local $end)))
    )
  )
  (func $copy (param $out i32) (param $in i32) (param $count i32)
    (call $ensure_memory_reach (i32.add (get_local $out) (get_local $count)))
    ;; if $out is not 32-bit aligned, deal with that first
    block $break
      loop $top
        (if (i32.eqz (get_local $count)) (return))
        ;; if $out is 32-bit aligned, break
        (br_if $break (i32.eqz (i32.and (get_local $out) (i32.const 3))))
        ;; otherwise, copy 1 byte and continue
        (i32.store8 (get_local $out) (i32.load8_u (get_local $in)))
        (set_local    $in (i32.add (get_local    $in) (i32.const 1)))
        (set_local   $out (i32.add (get_local   $out) (i32.const 1)))
        (set_local $count (i32.sub (get_local $count) (i32.const 1)))
        br $top
      end
    end $break
    ;; switch-table on $count's highest set bit
    block $b0_3
      block $b4_7
        block $b8_15
          block $b16_or_more
            (i32.sub (i32.const 32) (i32.clz (get_local $count)))
            br_table $b0_3 $b0_3 $b0_3 $b4_7 $b8_15 $b16_or_more
          end $b16_or_more
          loop $top
            (i32.store          (get_local $out)                 (i32.load          (get_local $in)                ))
            (i32.store (i32.add (get_local $out) (i32.const  4)) (i32.load (i32.add (get_local $in) (i32.const  4))))
            (i32.store (i32.add (get_local $out) (i32.const  8)) (i32.load (i32.add (get_local $in) (i32.const  8))))
            (i32.store (i32.add (get_local $out) (i32.const 12)) (i32.load (i32.add (get_local $in) (i32.const 12))))
                                  (set_local    $in (i32.add (get_local    $in) (i32.const 16)))
                                  (set_local   $out (i32.add (get_local   $out) (i32.const 16)))
            (br_if $top (i32.ge_u (tee_local $count (i32.sub (get_local $count) (i32.const 16))) (i32.const 16)))
          end
          (br_if $b0_3 (i32.lt_u (get_local $count) (i32.const 4)))
          (br_if $b4_7 (i32.lt_u (get_local $count) (i32.const 8)))
          ;; fall through:
        end $b8_15
        (i32.store          (get_local $out)                 (i32.load          (get_local $in)                ))
        (i32.store (i32.add (get_local $out) (i32.const  4)) (i32.load (i32.add (get_local $in) (i32.const  4))))
                               (set_local    $in (i32.add (get_local    $in) (i32.const 8)))
                               (set_local   $out (i32.add (get_local   $out) (i32.const 8)))
        (br_if $b0_3 (i32.lt_u (tee_local $count (i32.sub (get_local $count) (i32.const 8))) (i32.const 4)))
        ;; fall through:
      end $b4_7
      (i32.store (get_local $out) (i32.load (get_local $in)))
      (set_local    $in (i32.add (get_local    $in) (i32.const 4)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
      (set_local $count (i32.sub (get_local $count) (i32.const 4)))
    end $b0_3
    loop $top
      ;; if count=0, return
      (if (i32.eqz (get_local $count)) (return))
      ;; otherwise, copy 1 byte and continue
      (i32.store8 (get_local $out) (i32.load8_u (get_local $in)))
      (set_local    $in (i32.add (get_local    $in) (i32.const 1)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 1)))
      (set_local $count (i32.sub (get_local $count) (i32.const 1)))
      br $top
    end
  )
  (func $fill (param $out i32) (param $val i32) (param $count i32)
    (call $ensure_memory_reach (i32.add (get_local $out) (get_local $count)))
    ;; if $out is not 32-bit aligned, deal with that first
    block $break
      loop $top
        ;; if count=0, return
        (if (i32.eqz (get_local $count)) (return))
        ;; if $out is 32-bit aligned, break
        (br_if $break (i32.eqz (i32.and (get_local $out) (i32.const 3))))
        ;; otherwise, fill 1 byte and continue
        (i32.store8 (get_local $out) (get_local $val))
        (set_local   $out (i32.add (get_local   $out) (i32.const 1)))
        (set_local $count (i32.sub (get_local $count) (i32.const 1)))
        br $top
      end
    end $break
    ;; turn $val the byte into a 32-bit pattern of itself
    (set_local $val (i32.and (get_local $val) (i32.const 255)))
    (set_local $val (i32.or (get_local $val) (i32.shl (get_local $val) (i32.const  8))))
    (set_local $val (i32.or (get_local $val) (i32.shl (get_local $val) (i32.const 16))))
    ;; switch-table on $count's highest set bit
    block $b0_3
      block $b4_7
        block $b8_15
          block $b16_or_more
            (i32.sub (i32.const 32) (i32.clz (get_local $count)))
            br_table $b0_3 $b0_3 $b0_3 $b4_7 $b8_15 $b16_or_more
          end $b16_or_more
          loop $top
            (i32.store          (get_local $out)                 (get_local $val))
            (i32.store (i32.add (get_local $out) (i32.const  4)) (get_local $val))
            (i32.store (i32.add (get_local $out) (i32.const  8)) (get_local $val))
            (i32.store (i32.add (get_local $out) (i32.const 12)) (get_local $val))
                                  (set_local   $out (i32.add (get_local   $out) (i32.const 16)))
            (br_if $top (i32.ge_u (tee_local $count (i32.sub (get_local $count) (i32.const 16))) (i32.const 16)))
          end
          (br_if $b0_3 (i32.lt_u (get_local $count) (i32.const 4)))
          (br_if $b4_7 (i32.lt_u (get_local $count) (i32.const 8)))
          ;; fall through:
        end $b8_15
        (i32.store          (get_local $out)                 (get_local $val))
        (i32.store (i32.add (get_local $out) (i32.const  4)) (get_local $val))
                               (set_local   $out (i32.add (get_local   $out) (i32.const 8)))
        (br_if $b0_3 (i32.lt_u (tee_local $count (i32.sub (get_local $count) (i32.const 8))) (i32.const 4)))
        ;; fall through:
      end $b4_7
      (i32.store (get_local $out) (get_local $val))
      (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
      (set_local $count (i32.sub (get_local $count) (i32.const 4)))
    end $b0_3
    loop $top
      ;; if count=0, return
      (if (i32.eqz (get_local $count)) (return))
      ;; otherwise, copy 1 byte and continue
      (i32.store8 (get_local $out) (get_local $val))
      (set_local   $out (i32.add (get_local   $out) (i32.const 1)))
      (set_local $count (i32.sub (get_local $count) (i32.const 1)))
      br $top
    end
  )
  (;
  (func (export "unpack_paletted") (param $out i32) (param $in i32) (param $palette i32) (param $count i32)
    ;; ensure mem[..$out + $count*4]
    (call $ensure_memory_reach (i32.add (get_local $out) (i32.mul (get_local $count) (i32.const 4))))
    block $p0_3
      block $p4_7
        block $p8_15
          block $p16_or_more
            (i32.sub (i32.const 32) (i32.clz (get_local $count)))
            br_table $p0_3 $p0_3 $p0_3 $p4_7 $p8_15 $p16_or_more
          end $p16_or_more
          loop $top
            (i32.store          (get_local $out)
                (i32.load (i32.add (get_local $palette) (i32.load8_u          (get_local $in)                ))))
            (i32.store (i32.add (get_local $out) (i32.const  4))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  1))))))
            (i32.store (i32.add (get_local $out) (i32.const  8))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  2))))))
            (i32.store (i32.add (get_local $out) (i32.const 12))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  3))))))
            (i32.store (i32.add (get_local $out) (i32.const 16))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  4))))))
            (i32.store (i32.add (get_local $out) (i32.const 20))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  5))))))
            (i32.store (i32.add (get_local $out) (i32.const 24))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  6))))))
            (i32.store (i32.add (get_local $out) (i32.const 28))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  7))))))
            (i32.store (i32.add (get_local $out) (i32.const 32))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  8))))))
            (i32.store (i32.add (get_local $out) (i32.const 36))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const  9))))))
            (i32.store (i32.add (get_local $out) (i32.const 40))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 10))))))
            (i32.store (i32.add (get_local $out) (i32.const 44))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 11))))))
            (i32.store (i32.add (get_local $out) (i32.const 48))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 12))))))
            (i32.store (i32.add (get_local $out) (i32.const 52))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 13))))))
            (i32.store (i32.add (get_local $out) (i32.const 56))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 14))))))
            (i32.store (i32.add (get_local $out) (i32.const 60))
                (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 15))))))
                                (set_local    $in (i32.add (get_local    $in) (i32.const 16)))
                                (set_local   $out (i32.add (get_local   $out) (i32.const 64)))
            (br_if $top (i32.ge_u (tee_local $count (i32.sub (get_local $count) (i32.const 16))) (i32.const 16)))
          end
          (br_if $p0_3 (i32.lt_u (get_local $count) (i32.const 4)))
          (br_if $p4_7 (i32.lt_u (get_local $count) (i32.const 8)))
          ;; fall through:
        end $p8_15
        (i32.store          (get_local $out)
            (i32.load (i32.add (get_local $palette) (i32.load8_u          (get_local $in)               ))))
        (i32.store (i32.add (get_local $out) (i32.const  4))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 1))))))
        (i32.store (i32.add (get_local $out) (i32.const  8))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 2))))))
        (i32.store (i32.add (get_local $out) (i32.const 12))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 3))))))
        (i32.store (i32.add (get_local $out) (i32.const 16))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 4))))))
        (i32.store (i32.add (get_local $out) (i32.const 20))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 5))))))
        (i32.store (i32.add (get_local $out) (i32.const 24))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 6))))))
        (i32.store (i32.add (get_local $out) (i32.const 28))
            (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 7))))))
                       (set_local    $in (i32.add (get_local    $in) (i32.const  8)))
                       (set_local   $out (i32.add (get_local   $out) (i32.const 32)))
        (br_if $p0_3 (i32.lt_u (tee_local $count (i32.sub (get_local $count) (i32.const  8))) (i32.const 4)))
        ;; fall through:
      end $p4_7
      (i32.store          (get_local $out)
          (i32.load (i32.add (get_local $palette) (i32.load8_u          (get_local $in)               ))))
      (i32.store (i32.add (get_local $out) (i32.const  4))
          (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 1))))))
      (i32.store (i32.add (get_local $out) (i32.const  8))
          (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 2))))))
      (i32.store (i32.add (get_local $out) (i32.const 12))
          (i32.load (i32.add (get_local $palette) (i32.load8_u (i32.add (get_local $in) (i32.const 3))))))
      (set_local    $in (i32.add (get_local    $in) (i32.const  4)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 16)))
      (set_local $count (i32.sub (get_local $count) (i32.const  4)))
      ;; fall through:
    end $p0_3
    loop $top
      ;; if count=0, return
      (if (i32.eqz (get_local $count)) (return))
      ;; otherwise, write 1 pixel and continue
      (i32.store (get_local $out) (i32.load (i32.add (get_local $palette) (i32.load8_u (get_local $in)))))
      (set_local    $in (i32.add (get_local    $in) (i32.const 1)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
      (set_local $count (i32.sub (get_local $count) (i32.const 1)))
      br $top
    end
  )
  (func $expand_r5g6b5 (param $r5g6b5 i32) (param $opaque i32) (param $transparent_r5g6b5 i32) (result i32)
    (local $a8b8g8r8 i32)
    (local $temp i32)
    ;; alpha component
    (if (i32.or (get_local $opaque) (i32.ne (get_local $r5g6b5) (get_local $transparent_r5g6b5)))
      (set_local $a8b8g8r8 (i32.const -16777216)) ;; 0xff000000
    )
    ;; red component
    (set_local $temp (i32.shr_u (get_local $r5g6b5) (i32.const 11)))
    (set_local $temp (i32.or (i32.shl (get_local $temp) (i32.const 3)) (i32.shr_u (get_local $temp) (i32.const 2))))
    (set_local $a8b8g8r8 (i32.or (get_local $a8b8g8r8) (get_local $temp)))
    ;; green component
    (set_local $temp (i32.and (i32.shr_u (get_local $r5g6b5) (i32.const 5)) (i32.const 63)))
    (set_local $temp (i32.or (i32.shl (get_local $temp) (i32.const 2)) (i32.shr_u (get_local $temp) (i32.const 4))))
    (set_local $a8b8g8r8 (i32.or (get_local $a8b8g8r8) (i32.shl (get_local $temp) (i32.const 8))))
    ;; blue component
    (set_local $temp (i32.and (get_local $r5g6b5) (i32.const 31)))
    (set_local $temp (i32.or (i32.shl (get_local $temp) (i32.const 2)) (i32.shr_u (get_local $temp) (i32.const 4))))
    (set_local $a8b8g8r8 (i32.or (get_local $a8b8g8r8) (i32.shl (get_local $temp) (i32.const 16))))
    ;; done!
    (return (get_local $a8b8g8r8))
  )
  (func (export "unpack_r5g6b5") (param $out i32) (param $in i32) (param $opaque i32) (param $transp i32) (param $count i32)
    (local $pixel i32)
    ;; ensure mem[..$out + $count*4]
    (call $ensure_memory_reach (i32.add (get_local $out) (i32.mul (get_local $count) (i32.const 4))))
    block $p0_3
      block $p4_7
        block $p8_15
          block $p16_or_more
            (i32.sub (i32.const 32) (i32.clz (get_local $count)))          
            br_table $p0_3 $p0_3 $p0_3 $p4_7 $p8_15 $p16_or_more
          end $p16_or_more
          loop $top
            (i32.store          (get_local $out)
              (call $expand_r5g6b5 (i32.load16_u          (get_local $in)                ) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const  4))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  2))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const  8))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  4))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 12))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  6))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 14))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  8))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 20))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 10))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 24))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 12))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 28))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 14))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 32))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 16))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 36))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 18))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 40))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 20))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 44))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 22))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 48))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 24))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 52))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 26))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 56))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 28))) (get_local $opaque) (get_local $transp)))
            (i32.store (i32.add (get_local $out) (i32.const 60))
              (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 30))) (get_local $opaque) (get_local $transp)))
                                  (set_local    $in (i32.add (get_local    $in) (i32.const 32)))
                                  (set_local   $out (i32.add (get_local   $out) (i32.const 64)))
            (br_if $top (i32.ge_u (tee_local $count (i32.sub (get_local $count) (i32.const 16))) (i32.const 16)))
          end
          (br_if $p0_3 (i32.lt_u (get_local $count) (i32.const 4)))
          (br_if $p4_7 (i32.lt_u (get_local $count) (i32.const 8)))
          ;; fall through:
        end $p8_15
        (i32.store          (get_local $out)
          (call $expand_r5g6b5 (i32.load16_u          (get_local $in)                ) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const  4))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  2))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const  8))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  4))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const 12))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  6))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const 14))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const  8))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const 20))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 10))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const 24))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 12))) (get_local $opaque) (get_local $transp)))
        (i32.store (i32.add (get_local $out) (i32.const 28))
          (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 14))) (get_local $opaque) (get_local $transp)))
                               (set_local    $in (i32.add (get_local    $in) (i32.const 16)))
                               (set_local   $out (i32.add (get_local   $out) (i32.const 32)))
        (br_if $p0_3 (i32.lt_u (tee_local $count (i32.sub (get_local $count) (i32.const  8))) (i32.const 4)))
        ;; fall through:
      end $p4_7
      (i32.store          (get_local $out)
        (call $expand_r5g6b5 (i32.load16_u          (get_local $in)               ) (get_local $opaque) (get_local $transp)))
      (i32.store (i32.add (get_local $out) (i32.const  4))
        (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 2))) (get_local $opaque) (get_local $transp)))
      (i32.store (i32.add (get_local $out) (i32.const  8))
        (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 4))) (get_local $opaque) (get_local $transp)))
      (i32.store (i32.add (get_local $out) (i32.const 12))
        (call $expand_r5g6b5 (i32.load16_u (i32.add (get_local $in) (i32.const 6))) (get_local $opaque) (get_local $transp)))
      (set_local    $in (i32.add (get_local    $in) (i32.const  8)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 16)))
      (set_local $count (i32.sub (get_local $count) (i32.const  4)))
      ;; fall through:
    end $p0_3
    loop $top
      ;; if count=0, return
      (if (i32.eqz (get_local $count)) (return))
      ;; otherwise, write 1 pixel and continue
      (i32.store (get_local $out)
        (call $expand_r5g6b5 (i32.load16_u (get_local $in)) (get_local $opaque) (get_local $transp)))
      (set_local    $in (i32.add (get_local    $in) (i32.const 2)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
      (set_local $count (i32.sub (get_local $count) (i32.const 1)))
      br $top
    end
  )
  (func $expand_b8g8r8 (param $b8g8r8 i32) (param $opaque i32) (param $transp i32) (result i32)
    (return (if i32 (i32.and (i32.eqz (get_local $opaque) (i32.eq (get_local $b8g8r8) (get_local $transp))))
      (i32.or (get_local $b8g8r8) (i32.const -16777216)) ;; 0xff000000
      (i32.and (get_local $b8g8r8) (i32.const 16777215)) ;; 0x00ffffff
    ))
  )
  (func $read_b8g8r8 (param $in i32) (result i32)
    (local $r i32)
    (local $g i32)
    (local $b i32)
    (set_local $r (i32.load8_u          (get_local $in)               ))
    (set_local $g (i32.load8_u (i32.add (get_local $in) (i32.const 1))))
    (set_local $b (i32.load8_u (i32.add (get_local $in) (i32.const 2))))
    (return
      (i32.or
        (get_local $r)
        (i32.or
          (i32.shl (get_local $g) (i32.const  8))
          (i32.shl (get_local $b) (i32.const 16))
        )))
  )
  (func (export "unpack_b8g8r8")
      (param $out i32)
      (param $in i32)
      (param $opaque i32)
      (param $transp i32)
      (param $count i32)
      (result i32)
    (local $temp1 i32)
    (local $temp2 i32)
    (local $temp3 i32)
    (call $ensure_memory_reach (i32.add (get_local $out) (i32.mul (get_local $count) (i32.const 4))))
    ;; if $in is not 32-bit aligned, deal with that first
    block $break
      loop $top
        ;; if count=0, return
        (if (i32.eqz (get_local $count)) (return))
        ;; if $in is 32-bit aligned, break
        (br_if $break (i32.eqz (i32.and (get_local $in) (i32.const 3))))
        ;; otherwise, copy 1 pixel and continue
        (i32.store
          (get_local $out)
          (call $expand_b8g8r8
            (call $read_b8g8r8 (get_local $in))
            (get_local $opaque)
            (get_local $transp)
          )
        )
        (set_local    $in (i32.add (get_local    $in) (i32.const 3)))
        (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
        (set_local $count (i32.sub (get_local $count) (i32.const 1)))
        (br $top)
      end
    end $break
    ;; do blocks of 4 pixels (12 bytes -> 16 bytes)
    block $break
      loop $top
        (br_if $break (i32.lt_u (get_local $count) (i32.const 12)))
        (set_local $temp1 (i32.load (get_local $in)))
        (set_local $temp2 (i32.load (i32.add (get_local $in) (i32.const 4))))
        (set_local $temp3 (i32.load (i32.add (get_local $in) (i32.const 8))))
        (i32.store
          (get_local $out)
          (call $expand_b8g8r8
            (get_local $temp1)
            (get_local $opaque)
            (get_local $transp)
          )
        )
        (i32.store
          (i32.add (get_local $out) (i32.const 4))
          (call $expand_b8g8r8
            (i32.or
              (i32.shr_u (get_local $temp1) (i32.const 24))
              (i32.shl   (get_local $temp2) (i32.const  8))
            )
            (get_local $opaque)
            (get_local $transp)
          )
        )
        (i32.store
          (i32.add (get_local $out) (i32.const 8))
          (call $expand_b8g8r8
            (i32.or
              (i32.shr_u (get_local $temp2) (i32.const 16))
              (i32.shl   (get_local $temp3) (i32.const 16))
            )
            (get_local $opaque)
            (get_local $transp)
          )
        )
        (i32.store
          (i32.add (get_local $out) (i32.const 12))
          (call $expand_b8g8r8
            (i32.shr_u (get_local $temp3) (i32.const 8))
            (get_local $opaque)
            (get_local $transp)
          )
        )
        (set_local    $in (i32.add (get_local    $in) (i32.const 12)))
        (set_local   $out (i32.add (get_local   $out) (i32.const 16)))
        (set_local $count (i32.sub (get_local $count) (i32.const 4)))
        br $top
      end
    end $break
    ;; final 0-3 pixels
    loop $top
      ;; if count=0, return
      (if (i32.eqz (get_local $count)) (return (get_local $out)))
      ;; copy 1 pixel and continue
      (i32.store
        (get_local $out)
        (call $expand_b8g8r8
          (call $read_b8g8r8 (get_local $in))
          (get_local $opaque)
          (get_local $transp)
        )
      )
      (set_local    $in (i32.add (get_local    $in) (i32.const 3)))
      (set_local   $out (i32.add (get_local   $out) (i32.const 4)))
      (set_local $count (i32.sub (get_local $count) (i32.const 1)))
      br $top
    end
    unreachable
  )
  (func (export "unpack_allegro") (param $out i32) (param $in i32) (param $in_end i32) (result i32)
    (local $count i32)
    (local $val i32)
    loop $top
      ;; if $in >= $in_end, return $out
      (if (i32.ge_u (get_local $in) (get_local $in_end)) (return (get_local $out)))
      ;; get a signed byte at $in
      (set_local $count (i32.load8_s (get_local $in)))
      ;; $in++
      (set_local $in (i32.add (get_local $in) (i32.const 1)))
      (if (i32.ge_u (get_local $count) (i32.const 0)) (then
        ;; $count >= 0: make a literal copy of (count+1) bytes
        (set_local $count (i32.add (get_local $count) (i32.const 1)))
        (call $copy (get_local $out) (get_local $in) (get_local $count))
        (set_local  $in (i32.add (get_local  $in) (get_local $count)))
        (set_local $out (i32.add (get_local $out) (get_local $count)))
      )
      (else
        (if (i32.eq (get_local $count) (i32.const -127)) (then
          ;; $count = -127: copy a single byte
          (i32.store8 (get_local $out) (i32.load8_u (get_local $in)))
          (set_local  $in (i32.add (get_local  $in) (i32.const 1)))
          (set_local $out (i32.add (get_local $out) (i32.const 1)))
        )
        (else
          ;; -127 < $count < 0: copy one byte of input, (1+abs($count)) times
          (set_local $count (i32.sub (i32.const 1) (get_local $count)))
          (set_local $val (i32.load8_u (get_local $in)))
          (set_local $in (i32.add (get_local $in) (i32.const 1)))
          (call $fill (get_local $out) (get_local $val) (get_local $count))
          (set_local $out (i32.add (get_local $out) (get_local $count)))
        ))
      ))
      br $top
    end
    unreachable
  )
  ;)
)
