(module

  (import "memory" "main" (memory 1))

  (func $get_lastTableBits (import "inflateTables" "get_lastTableBits") (result i32))
  (func $code_val (import "inflateTables" "code_val") (param i32) (result i32))
  (func $code_bits (import "inflateTables" "code_bits") (param i32) (result i32))
  (func $buildTable (import "inflateTables" "buildTable")
    (param i32 i32 i32 i32 i32)  
  )
  (global $CODES (import "inflateTables" "CODES") i32)
  (global $LENS (import "inflateTables" "LENS") i32)
  (global $DISTS (import "inflateTables" "DISTS") i32)
  (global $ptr<reserved> (import "memory" "inflateState*") i32)
  (global $ptr<fixedLengthTable> (import "memory" "fixedLengthTable*") i32)
  (global $ptr<fixedDistanceTable> (import "memory" "fixedDistanceTable*") i32)
  (global $sizeof<dynamicCodeTable> (import "memory" "sizeof dynamicCodeTable") i32)
  (global $sizeof<dynamicLengthTable> (import "memory" "sizeof dynamicLengthTable") i32)
  (global $sizeof<dynamicDistanceTable> (import "memory" "sizeof dynamicDistanceTable") i32)
  (global $ptr<codeLengthPermutations> (import "memory" "codeLengthPermutations*") i32)
  (global $ptr<literalLengthLens> (import "memory" "literalLengthLens*") i32)
  (global $sizeof<literalLengthLens> (import "memory" "sizeof literalLengthLens") i32)
  (global $ptr<distanceLens> (import "memory" "distanceLens*") i32)
  (global $sizeof<distanceLens> (import "memory" "sizeof distanceLens") i32)
  (global $ptr<codeLens> (import "memory" "codeLens*") i32)
  (global $sizeof<codeLens> (import "memory" "sizeof codeLens") i32)
  (global $fixedLengthBits (import "inflateTables" "fixedLengthBits") i32)
  (global $fixedDistanceBits (import "inflateTables" "fixedDistanceBits") i32)
  (global $sizeof<reserved> (mut i32) i32.const -1)
  (global $MAXBITS i32 i32.const 15)
  (global $in (mut i32) i32.const 0)
  (global $in_end (mut i32) i32.const 0)
  (global $out (mut i32) i32.const 0)
  (global $bits (mut i32) i32.const 0)
  (global $bitcount (mut i32) i32.const 0)
  (global $MODE_NEXT_BLOCK i32 i32.const 0)
  (global $MODE_UNCOMPRESSED_SIZE i32 i32.const 1)
  (global $MODE_UNCOMPRESSED_DATA i32 i32.const 2)
  (global $MODE_READ_TREES i32 i32.const 3)
  (global $MODE_CODE_LENGTH_CODES i32 i32.const 3)
  (global $MODE_LITERAL_LENGTH_CODES i32 i32.const 4)
  (global $MODE_DISTANCE_CODES i32 i32.const 5)
  (global $MODE_DECOMPRESS i32 i32.const 6)
  (global $MODE_FINISHED i32 i32.const 7)
  (global $MODE_ERROR i32 i32.const 8)
  (global $mode (mut i32) i32.const 0)
  (global $BLOCK_UNCOMPRESSED i32 i32.const 0)
  (global $BLOCK_FIXED i32 i32.const 1)
  (global $BLOCK_DYNAMIC i32 i32.const 1)
  (global $is_final_block i32 i32.const 0)
  (global $uncompressed_size (mut i32) i32.const 0)
  (global $ptr<dynamicCodeTable> (mut i32) i32.const -1)
  (global $ptr<dynamicLengthTable> (mut i32) i32.const -1)
  (global $ptr<dynamicDistanceTable> (mut i32) i32.const -1)
  (global $ptr<lengthTable> (mut i32) i32.const -1)
  (global $ptr<distanceTable> (mut i32) i32.const -1)
  (global $ptr<lens> (mut i32) i32.const -1)
  (global $end<lens> (mut i32) i32.const -1)
  (global $codeBits (mut i32) i32.const 0)
  (global $lengthBits (mut i32) i32.const 0)
  (global $distanceBits (mut i32) i32.const 0)
  (global $here (mut i32) i32.const 0)
  (global $literalLengthCodes (mut i32) i32.const 0)
  (global $distanceCodes (mut i32) i32.const 0)
  (global $codeLengthCodes (mut i32) i32.const 0)
  (global $back (mut i32) i32.const 0)

  (func $start
    (set_global $ptr<dynamicCodeTable> (get_global $ptr<reserved>))
    (set_global $ptr<dynamicLengthTable> (i32.add
      (get_global $ptr<dynamicCodeTable>)
      (get_global $sizeof<dynamicCodeTable>)
    ))
    (set_global $ptr<dynamicDistanceTable> (i32.add
      (get_global $ptr<dynamicLengthTable>)
      (get_global $sizeof<dynamicLengthTable>)
    ))
    (set_global $sizeof<reserved> (i32.add
      (get_global $sizeof<dynamicCodeTable>)
      (i32.add
        (get_global $sizeof<dynamicLengthTable>)
        (get_global $sizeof<dynamicDistanceTable>)
      )
    ))
  )

  (func (export "sizeof_inflateState") (result i32)
    (return (get_global $sizeof<reserved>))
  )

  (func (export "resetReader")
    (set_global $mode (get_global $MODE_NEXT_BLOCK))
    (set_global $bits (i32.const 0))
    (set_global $bitcount (i32.const 0))
  )

  (func (export "input") (param $in i32) (param $in_end i32)
    (set_global $in (get_local $in))
    (set_global $in_end (get_local $in_end))
  )

  (func (export "output") (param $out i32)
    (set_global $out (get_local $out))
  )

  (func $literal (param $size i32)
    block
      (br_if 0 (i32.eqz (get_local $size)))
      loop
        (i32.store8 (get_global $out) (i32.load8_u (get_global $in)))
        (set_global $out (i32.add (get_global $out) (i32.const 1)))
        (set_global $in  (i32.add (get_global $in ) (i32.const 1)))
        (br_if 0 (tee_local $size (i32.sub (get_local $size) (i32.const 1))))
      end
    end
  )

  (func $cantpullbyte (result i32)
    (if (i32.ge_u (get_global $in) (get_global $in_end))
      (return (i32.const 1))
    )
    (set_global $bits (i32.or (get_global $bits) (i32.shl (i32.load8_u (get_global $in)) (get_global $bitcount))))
    (set_global $bitcount (i32.add (get_global $bitcount) (i32.const 8)))
    (set_global $in (i32.add (get_global $in) (i32.const 1)))
    (return (i32.const 0))
  )

  (func $cantgetbits (param $required i32) (result i32)
    block $false
      block $true
        loop
          (br_if $true (i32.ge_u (get_global $bitcount) (get_local $required)))
          (br_if $false (call $cantpullbyte))
          br 0
        end
      end $true
      (return (i32.const 1))
    end $false
    (return (i32.const 0))
  )

  (func $peekbits (param $count i32) (result i32)
    (return (i32.and (get_global $bits) (i32.sub (i32.shl (i32.const 1) (get_local $count)) (i32.const 1))))
  )

  (func $dropbits (param $count i32)
    (set_global $bits (i32.shr_u (get_global $bits) (get_local $count)))
    (set_global $bitcount (i32.sub (get_global $bits) (get_local $count)))
  )

  (func $getbits (param $count i32) (result i32)
    (local $result i32)
    (set_local $result (call $peekbits (get_local $count)))
    (call $dropbits (get_local $count))
    (return (get_local $result))
  )

  (func $tobyteboundary
    (set_global $bits     (i32.shr_u (get_global $bits) (i32.and (get_global $bitcount) (i32.const 7))))
    (set_global $bitcount (i32.sub   (get_global $bits) (i32.and (get_global $bitcount) (i32.const 7))))
  )

  (func $codeLengthExpansionMustContinue (result i32)
    (local $len i32)
    (local $copy i32)

    block $false

    loop
      block
        loop
          (set_global $here (i32.load (i32.add
            (get_global $ptr<dynamicCodeTable>)
            (i32.mul (call $peekbits (get_global $codeBits)) (i32.const 4))
          )))
          (br_if 1 (i32.le_u (call $code_bits (get_global $here)) (get_global $bits)))
          (br_if $false (call $cantpullbyte))
          br 0
        end
      end
      block $continue
        block $copy:
          block $val>17: block $val=17: block $val=16: block $val<16:
          (call $code_val (get_global $here))
          br_table
            $val<16: $val<16: $val<16: $val<16: $val<16: $val<16: $val<16: $val<16:
            $val<16: $val<16: $val<16: $val<16: $val<16: $val<16: $val<16: $val<16:
            $val=16: $val=17: $val>17:
          end $val<16:
            (call $dropbits (call $code_bits (get_global $here)))
            (i32.store16 (get_global $ptr<lens>) (call $code_val (get_global $here)))
            (set_global $ptr<lens> (i32.add (get_global $ptr<lens>) (i32.const 2)))
            br $continue
          end $val=16:
            (br_if $false (call $cantgetbits (i32.add (call $code_bits (get_global $here)) (i32.const 2))))
            (call $dropbits (call $code_bits (get_global $here)))
            (if (i32.eq (get_global $ptr<lens>) (get_global $ptr<literalLengthLens>)) (then
              unreachable
            ))
            (set_local $len (i32.load16_u (i32.sub (get_global $ptr<lens>) (i32.const 2))))
            (set_local $copy (i32.add (i32.const 3) (call $peekbits (i32.const 2))))
            (call $dropbits (i32.const 2))
            br $copy:
          end $val=17:
            (br_if $false (call $cantgetbits (i32.add (call $code_bits (get_global $here)) (i32.const 3))))
            (call $dropbits (call $code_bits (get_global $here)))
            (set_local $len (i32.const 0))
            (set_local $copy (i32.add (i32.const 3) (call $peekbits (i32.const 3))))
            (call $dropbits (i32.const 3))
            br $copy:
          end $val>17:
            (br_if $false (call $cantgetbits (i32.add (call $code_bits (get_global $here)) (i32.const 7))))
            (call $dropbits (call $code_bits (get_global $here)))
            (set_local $len (i32.const 0))
            (set_local $copy (i32.add (i32.const 11) (call $peekbits (i32.const 7))))
            (call $dropbits (i32.const 7))
            br $copy:
        end $copy:
        (if (i32.gt_u
          (i32.add (get_global $ptr<lens>) (i32.mul (get_local $copy) (i32.const 2)))
          (get_global $end<lens>)
        ) (then
          unreachable
        ))
        loop
          ;; $copy must be >0 for the first iteration
          (i32.store16 (get_global $ptr<lens>) (get_local $len))
          (set_global $ptr<lens> (i32.add (get_global $ptr<lens>) (i32.const 2)))
          (br_if 0 (tee_local $copy (i32.sub (get_local $copy) (i32.const 1))))
        end
      end $continue
      (br_if 0 (i32.lt_u (get_global $ptr<lens>) (get_global $end<lens>)))
      (return (i32.const 1))
    end

    end $false (return (i32.const 0))
  )

  (func $inflate
    (local $size i32)
    block $break
      loop $continue

        block $ERROR:
        block $FINISHED:
        block $DECOMPRESS:
        block $DISTANCE_CODES:
        block $LITERAL_LENGTH_CODES:
        block $CODE_LENGTH_CODES:
        block $READ_TREES:
        block $UNCOMPRESSED_DATA:
        block $UNCOMPRESSED_SIZE:
        block $NEXT_BLOCK:

        get_global $mode

        br_table  $NEXT_BLOCK:
                  $UNCOMPRESSED_SIZE:
                    $UNCOMPRESSED_DATA:
                  $READ_TREES:
                    $CODE_LENGTH_CODES:
                    $LITERAL_LENGTH_CODES:
                    $DISTANCE_CODES:
                  $DECOMPRESS:
                  $FINISHED:
                  $ERROR:

        end $NEXT_BLOCK:
          (br_if $break (call $cantgetbits (i32.const 3)))
          (set_global $is_final_block (call $getbits (i32.const 1)))
          block $DYNAMIC: block $FIXED: block $UNCOMPRESSED:
          (br_table $UNCOMPRESSED: $FIXED: $DYNAMIC: $ERROR: (call $getbits (i32.const 2)))
          end $UNCOMPRESSED:
            (call $tobyteboundary)
            (set_global $mode (get_global $MODE_UNCOMPRESSED_SIZE))
            br $UNCOMPRESSED_SIZE:
          end $FIXED:
            (set_global $ptr<lengthTable> (get_global $ptr<fixedLengthTable>))
            (set_global $ptr<distanceTable> (get_global $ptr<fixedDistanceTable>))
            (set_global $lengthBits (get_global $fixedLengthBits))
            (set_global $distanceBits (get_global $fixedDistanceBits))
            (set_global $mode (get_global $MODE_DECOMPRESS))
            br $DECOMPRESS:
          end $DYNAMIC:
            (set_global $ptr<lengthTable> (get_global $ptr<dynamicLengthTable>))
            (set_global $ptr<distanceTable> (get_global $ptr<dynamicDistanceTable>))
            (set_global $mode (get_global $MODE_READ_TREES))
            br $READ_TREES:
        end $UNCOMPRESSED_SIZE:
          (br_if $break (call $cantgetbits (i32.const 32)))
          (set_global $uncompressed_size (call $getbits (i32.const 16)))
          (br_if $ERROR: (i32.ne
            (i32.xor (get_global $uncompressed_size) (call $getbits (i32.const 16)))
            (i32.const 0xffff)
          ))
          (set_global $mode (get_global $MODE_UNCOMPRESSED_DATA))
          ;; fall through:
        end $UNCOMPRESSED_DATA:
          (tee_local $size (i32.sub (get_global $in_end) (get_global $in)))
          (get_global $uncompressed_size)
          (i32.le_u (get_local $size) (get_global $uncompressed_size))
          (set_local $size (select))
          (call $literal (get_local $size))
          (set_global $uncompressed_size (i32.sub (get_global $uncompressed_size) (get_local $size)))
          (br_if $break (get_global $uncompressed_size))
          (set_global $mode (select (get_global $MODE_FINISHED) (get_global $MODE_NEXT_BLOCK) (get_global $is_final_block)))
          br $continue
        end $READ_TREES:
          (br_if $break (call $cantgetbits (i32.const 14)))
          (set_global $literalLengthCodes (i32.add (call $getbits (i32.const 5)) (i32.const 257)))
          (set_global $distanceCodes (i32.add (call $getbits (i32.const 5)) (i32.const 1)))
          (set_global $codeLengthCodes (i32.add (call $getbits (i32.const 4)) (i32.const 4)))
          (if (i32.or
            (i32.gt_u (get_global $literalLengthCodes) (i32.const 286))
            (i32.gt_u (get_global $distanceCodes) (i32.const 30))
          ) (then
            br $ERROR:
          ))
          (set_global $ptr<lens> (get_global $ptr<codeLens>))
          (set_global $end<lens> (i32.add (get_global $ptr<lens>) (i32.mul (i32.const 2) (get_global $codeLengthCodes))))
          (set_global $mode (get_global $MODE_CODE_LENGTH_CODES))
          ;; fall through:
        end $CODE_LENGTH_CODES:
          loop
            (br_if $break (call $cantgetbits (i32.const 3)))
            (i32.store16
              (get_global $ptr<lens>)
              (i32.load8_u (i32.add (get_global $ptr<codeLengthPermutations>) (call $getbits (i32.const 3))))
            )
            (set_global $ptr<lens> (i32.add (get_global $ptr<lens>) (i32.const 2)))
            (br_if 0 (i32.lt_u (get_global $ptr<lens>) (get_global $end<lens>)))
          end
          (set_global $end<lens> (i32.add (get_global $ptr<codeLens>) (get_global $sizeof<codeLens>)))
          block
            loop
              (br_if 1 (i32.ge_u (get_global $ptr<lens>) (get_global $end<lens>)))
              (i32.store16 (get_global $ptr<lens>) (i32.const 0))
              (set_global $ptr<lens> (i32.add (get_global $ptr<lens>) (i32.const 2)))
              br 0
            end
          end
          (call $buildTable
            (get_global $ptr<dynamicCodeTable>)
            (get_global $CODES)
            (i32.const 7)
            (get_global $ptr<codeLens>)
            (get_global $sizeof<codeLens>)
          )
          (set_global $codeBits (call $get_lastTableBits))
          (set_global $ptr<lens> (get_global $ptr<literalLengthLens>))
          (set_global $end<lens> (i32.add (get_global $ptr<lens>) (i32.mul (i32.const 2) (get_global $literalLengthCodes))))
          (set_global $mode (get_global $MODE_LITERAL_LENGTH_CODES))
          ;; fall through:
        end $LITERAL_LENGTH_CODES:
          (br_if $break (call $codeLengthExpansionMustContinue))
          (call $buildTable
            (get_global $ptr<dynamicLengthTable>)
            (get_global $LENS)
            (i32.const 9)
            (get_global $ptr<literalLengthLens>)
            (get_global $sizeof<literalLengthLens>)
          )
          (set_global $lengthBits (call $get_lastTableBits))
          (set_global $ptr<lens> (get_global $ptr<distanceLens>))
          (set_global $end<lens> (i32.add (get_global $ptr<lens>) (i32.mul (i32.const 2) (get_global $distanceCodes))))
          (set_global $mode (get_global $MODE_DISTANCE_CODES))
          ;; fall through:
        end $DISTANCE_CODES:
          (br_if $break (call $codeLengthExpansionMustContinue))
          (call $buildTable
            (get_global $ptr<dynamicDistanceTable>)
            (get_global $DISTS)
            (i32.const 6)
            (get_global $ptr<distanceLens>)
            (get_global $sizeof<distanceLens>)
          )
          (set_global $distanceBits (call $get_lastTableBits))
          (set_global $mode (get_global $MODE_DECOMPRESS))
          ;; fall through:
        end $DECOMPRESS:
          ;; TODO: fast track
          (set_global $back (i32.const 0))
          block
            loop
              (set_global $here (i32.load (i32.add
                (get_global $ptr<dynamicLengthTable>)
                (i32.mul (call $peekbits (get_global $lengthBits)) (i32.const 4))
              )))
              (br_if 1 (i32.le_u (call $code_bits (get_global $here)) (get_global $bits)))
              (br_if $break (call $cantpullbyte))
              br 0
            end
          end
          unreachable
          (set_global $mode (select (get_global $MODE_FINISHED) (get_global $MODE_NEXT_BLOCK) (get_global $is_final_block)))
          br $continue
        end $FINISHED:
          (return (i32.const 1))
        end $ERROR:
          (set_global $mode (get_global $MODE_ERROR))
          unreachable
      end
      unreachable
    end $break
    (return (i32.const 0))
  )

  (start $start)

)
