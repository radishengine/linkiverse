(module

  (import "memory" "main" (memory 0))

  ;; code as i32: VVVVBBPP
  ;; VVVV = val
  ;; BB = bits
  ;; PP = op
  
  (; https://github.com/madler/zlib/blob/v1.2.11/zlib.h#L166 ;)
  (global $Z_NO_FLUSH           i32 i32.const 0)
  (global $Z_PARTIAL_FLUSH       i32 i32.const 1)
  (global $Z_SYNC_FLUSH          i32 i32.const 2)
  (global $Z_FULL_FLUSH          i32 i32.const 3)
  (global $Z_FINISH              i32 i32.const 4)
  (global $Z_BLOCK               i32 i32.const 5)
  (global $Z_TREES               i32 i32.const 6)
  (global $Z_OK                  i32 i32.const 0)
  (global $Z_STREAM_END          i32 i32.const 1)
  (global $Z_NEED_DICT           i32 i32.const 2)
  (global $Z_ERRNO               i32 i32.const -1)
  (global $Z_STREAM_ERROR        i32 i32.const -2)
  (global $Z_DATA_ERROR          i32 i32.const -3)
  (global $Z_MEM_ERROR           i32 i32.const -4)
  (global $Z_BUF_ERROR           i32 i32.const -5)
  (global $Z_VERSION_ERROR       i32 i32.const -6)
  (global $Z_NO_COMPRESSION      i32 i32.const 0)
  (global $Z_BEST_SPEED          i32 i32.const 1)
  (global $Z_BEST_COMPRESSION    i32 i32.const 9)
  (global $Z_DEFAULT_COMPRESSION i32 i32.const -1)
  (global $Z_FILTERED            i32 i32.const 1)
  (global $Z_HUFFMAN_ONLY        i32 i32.const 2)
  (global $Z_RLE                 i32 i32.const 3)
  (global $Z_FIXED               i32 i32.const 4)
  (global $Z_DEFAULT_STRATEGY    i32 i32.const 0)
  (global $Z_BINARY              i32 i32.const 0)
  (global $Z_TEXT                i32 i32.const 1)
  (global $Z_UNKNOWN             i32 i32.const 2)
  (global $Z_DEFLATED            i32 i32.const 8)
  (global $Z_NULL                i32 i32.const 0)
  
  (; https://github.com/madler/zlib/blob/v1.2.11/zlib.h#L86 ;)
  (global $z_stream.&next_in   i32 i32.const 0)
  (global $z_stream.&avail_in  i32 i32.const 4)
  (global $z_stream.&total_in  i32 i32.const 8)
  (global $z_stream.&next_out  i32 i32.const 12)
  (global $z_stream.&avail_out i32 i32.const 16)
  (global $z_stream.&total_out i32 i32.const 20)
  (global $z_stream.&msg       i32 i32.const 24)
  (global $z_stream.&state     i32 i32.const 28)
  (global $z_stream.&zalloc    i32 i32.const 32)
  (global $z_stream.&zfree     i32 i32.const 36)
  (global $z_stream.&opaque    i32 i32.const 40)
  (global $z_stream.&data_type i32 i32.const 44)
  (global $z_stream.&adler     i32 i32.const 48)
  (global $z_stream.&reserved  i32 i32.const 52)
  (global $#z_stream           i32 i32.const 56)
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inflate.h#L20 ;)
  (global $HEAD        i32 i32.const 16180) ;; i: waiting for magic header
  (global $FLAGS       i32 i32.const 16181) ;; i: waiting for method and flags (gzip)
  (global $TIME        i32 i32.const 16182) ;; i: waiting for modification time (gzip)
  (global $OS          i32 i32.const 16183) ;; i: waiting for extra flags and operating system (gzip)
  (global $EXLEN       i32 i32.const 16184) ;; i: waiting for extra length (gzip)
  (global $EXTRA       i32 i32.const 16185) ;; i: waiting for extra bytes (gzip)
  (global $NAME        i32 i32.const 16186) ;; i: waiting for end of file name (gzip)
  (global $COMMENT     i32 i32.const 16187) ;; i: waiting for end of comment (gzip)
  (global $HCRC        i32 i32.const 16188) ;; i: waiting for header crc (gzip)
  (global $DICTID      i32 i32.const 16189) ;; i: waiting for dictionary check value
  (global $DICT        i32 i32.const 16190) ;; waiting for inflateSetDictionary() call
    (global $TYPE      i32 i32.const 16191) ;; i: waiting for type bits, including last-flag bit
    (global $TYPEDO    i32 i32.const 16192) ;; i: same, but skip check to exit inflate on new block
    (global $STORED    i32 i32.const 16193) ;; i: waiting for stored size (length and complement)
    (global $COPY_     i32 i32.const 16194) ;; i/o: same as COPY below, but only first time in
    (global $COPY      i32 i32.const 16195) ;; i/o: waiting for input or output to copy stored block
    (global $TABLE     i32 i32.const 16196) ;; i: waiting for dynamic block table lengths
    (global $LENLENS   i32 i32.const 16197) ;; i: waiting for code length code lengths
    (global $CODELENS  i32 i32.const 16198) ;; i: waiting for length/lit and distance code lengths
      (global $LEN_    i32 i32.const 16199) ;; i: same as LEN below, but only first time in
      (global $LEN     i32 i32.const 16200) ;; i: waiting for length/lit/eob code
      (global $LENEXT  i32 i32.const 16201) ;; i: waiting for length extra bits
      (global $DIST    i32 i32.const 16202) ;; i: waiting for distance code
      (global $DISTEXT i32 i32.const 16203) ;; i: waiting for distance extra bits
      (global $MATCH   i32 i32.const 16204) ;; o: waiting for output space to copy string
      (global $LIT     i32 i32.const 16205) ;; o: waiting for output space to write literal
  (global $CHECK       i32 i32.const 16206) ;; i: waiting for 32-bit check value
  (global $LENGTH      i32 i32.const 16207) ;; i: waiting for 32-bit length (gzip)
  (global $DONE        i32 i32.const 16208) ;; finished check, done -- remain here until reset
  (global $BAD         i32 i32.const 16209) ;; got a data error -- remain here until reset
  (global $MEM         i32 i32.const 16210) ;; got an inflate() memory error -- remain here until reset
  (global $SYNC        i32 i32.const 16211) ;; looking for synchronization bytes to restart inflate()
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inflate.h#L82 ;)
  (global $inflate_state.&strm     i32 i32.const 0)
  (global $inflate_state.&mode     i32 i32.const 4)
  (global $inflate_state.&last     i32 i32.const 8)
  (global $inflate_state.&wrap     i32 i32.const 12)
  (global $inflate_state.&havedict i32 i32.const 16)
  (global $inflate_state.&flags    i32 i32.const 20)
  (global $inflate_state.&dmax     i32 i32.const 24)
  (global $inflate_state.&check    i32 i32.const 28)
  (global $inflate_state.&total    i32 i32.const 32)
  (global $inflate_state.&head     i32 i32.const 36)
  (global $inflate_state.&wbits    i32 i32.const 40)
  (global $inflate_state.&wsize    i32 i32.const 44)
  (global $inflate_state.&whave    i32 i32.const 48)
  (global $inflate_state.&wnext    i32 i32.const 52)
  (global $inflate_state.&window   i32 i32.const 56)
  (global $inflate_state.&hold     i32 i32.const 60)
  (global $inflate_state.&bits     i32 i32.const 64)
  (global $inflate_state.&length   i32 i32.const 68)
  (global $inflate_state.&offset   i32 i32.const 72)
  (global $inflate_state.&extra    i32 i32.const 76)
  (global $inflate_state.&lencode  i32 i32.const 80)
  (global $inflate_state.&distcode i32 i32.const 84)
  (global $inflate_state.&lenbits  i32 i32.const 88)
  (global $inflate_state.&distbits i32 i32.const 92)
  (global $inflate_state.&ncode    i32 i32.const 96)
  (global $inflate_state.&nlen     i32 i32.const 100)
  (global $inflate_state.&ndist    i32 i32.const 104)
  (global $inflate_state.&have     i32 i32.const 108)
  (global $inflate_state.&next     i32 i32.const 112)
  (global $inflate_state.&lens     i32 i32.const 116)
   (global $inflate_state.#lens    i32 i32.const 320)
  (global $inflate_state.&work     i32 i32.const 756)
   (global $inflate_state.#work    i32 i32.const 288)
  (global $inflate_state.&codes    i32 i32.const 1332)
   (global $inflate_state.#codes   i32 i32.const 1444)
  (global $inflate_state.&sane     i32 i32.const 7108)
  (global $inflate_state.&back     i32 i32.const 7112)
  (global $inflate_state.&was      i32 i32.const 7116)
  (global $#inflate_state          i32 i32.const 7120)
  
  (global $adler32_initial i32 i32.const 1)
  
  (; https://github.com/madler/zlib/blob/v1.2.11/adler32.c#L63 ;)
  (func (export "adler32") (param $adler i32) (param $in i32) (param $len i32)
    (param $sum2 i32)
    (param $n i32)
    
    (set_local $sum2 (i32.shr_u (get_local $adler) (i32.const 16)))
    (set_local $adler (i32.and (get_local $adler) (i32.const 0xffff)))
    
    (if (i32.eq (get_local $len) (i32.const 1)) (then
      (set_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
      (if (i32.ge_u (get_local $adler) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $adler) (i32.const 65521)))
      ))
      (set_local $sum2 (i32.add (get_local $sum2) (get_local $adler)))
      (if (i32.ge_u (get_local $sum2) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $sum2) (i32.const 65521)))
      ))
      (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))
    ))
    
    (if (i32.lt_u (get_local $len) (i32.const 16)) (then
      (if (get_local $len) (then
        loop $top
          ;; sum2 += (adler += *buf++);
          get_local $sum2
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
          i32.add
          set_local $sum2
          (set_local $in (i32.add (get_local $in) (i32.const 1)))
          (br_if $top (tee_local $len (i32.sub (get_local $len) (i32.const 1))))
        end
      ))
      (if (i32.ge_u (get_local $adler) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $adler) (i32.const 65521)))
      ))
      (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))
      (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))      
    ))
    
    block $break
      loop $top
        (br_if $break (i32.lt_u (get_local $len) (i32.const 5552)))
        (set_local $len (i32.sub (get_local $len) (i32.const 5552)))
        (set_local $n (i32.const 347)) ;; 347 = 5552 / 16
        loop $top2
          ;; un-rollin'-rollin'-rollin'
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=0 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=1 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=2 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=3 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=4 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=5 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=6 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=7 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=8 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=9 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=10 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=11 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=12 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=13 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=14 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=15 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (set_local $in (i32.add (get_local $in) (i32.const 16)))
          (br_if $top2 (tee_local $n (i32.sub (get_local $n) (i32.const 1))))
        end
        (set_local $adler (i32.rem_u (get_local $adler) (i32.const 65521)))
        (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))
        br $top
      end
    end $break
    
    (if (get_local $len) (then
      block $break
        loop $top
          (br_if $break (i32.lt_u (get_local $len) (i32.const 16)))
          (set_local $len (i32.sub (get_local $len) (i32.const 16)))
          ;; un-rollin'-rollin'-rollin'
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=0 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=1 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=2 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=3 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=4 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=5 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=6 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=7 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=8 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=9 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=10 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=11 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=12 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=13 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=14 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=15 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (set_local $in (i32.add (get_local $in) (i32.const 16)))
        end
        ;; same as an earlier loop, for the $len<16 case
        (if (get_local $len) (then
          loop $top
            ;; sum2 += (adler += *buf++);
            get_local $sum2
            (tee_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
            i32.add
            set_local $sum2
            (set_local $in (i32.add (get_local $in) (i32.const 1)))
            (br_if $top (tee_local $len (i32.sub (get_local $len) (i32.const 1))))
          end
        ))
        (set_local $adler (i32.rem_u (get_local $adler) (i32.const 65521)))
        (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))        
      end $break
    ))
    
    (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))      
  )
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inffast.c#L50 ;)
  (func $inflate_fast
      (param $strm i32)
      (param $start i32) ;; inflate()'s starting value for strm->avail_out
    (local $state  i32)
    (local $in     i32) ;; local strm->next_in
    (local $last   i32) ;; have enough input while $in < $last
    (local $out    i32) ;; local strm->next_out
    (local $beg    i32) ;; inflate()'s initial strm->next_out
    (local $end    i32) ;; while $out < $end, enough space available
    (local $wsize  i32) ;; window size or zero if not using window
    (local $whave  i32) ;; valid bytes in the window
    (local $wnext  i32) ;; window write index
    (local $window i32) ;; allocated sliding window, if wsize != 0
    (local $hold   i32) ;; local strm->hold
    (local $bits   i32) ;; local strm->bits
    (local $lcode  i32) ;; local strm->lencode
    (local $dcode  i32) ;; local strm->distcode
    (local $lmask  i32) ;; mask for first level of length codes
    (local $dmask  i32) ;; mask for first level of distance codes
    (local $here   i32) ;; retrieved table entry
    (local $op     i32) ;; code bits, operation, extra bits, or window position, window bytes to copy
    (local $len    i32) ;; match length, unused bytes
    (local $dist   i32) ;; match distance
    (local $from   i32) ;; where to copy match from
    
    ;; copy state to local variables
    (set_local $state   (i32.load (i32.add (get_local $strm) (get_global $z_stream.&state))))
    (set_local $in      (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_in))))
    (set_local $last
      (i32.add
        (get_local $in)
        (i32.sub
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in)))
                        (i32.const 5)
        )
      )
    )
    (set_local $out     (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_out))))
    (set_local $beg
      (i32.sub
        (get_local $out)
        (i32.sub
                        (get_local $start)
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_out)))
        )
      )
    )
    (set_local $end
      (i32.add
        (get_local $out)
        (i32.sub
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in)))
                        (i32.const 257)
        )
      )
    )
    (set_local $wsize  (i32.load (i32.add (get_local $state) (get_global $inflate_state.&wsize))))
    (set_local $whave  (i32.load (i32.add (get_local $state) (get_global $inflate_state.&whave))))
    (set_local $wnext  (i32.load (i32.add (get_local $state) (get_global $inflate_state.&wnext))))
    (set_local $window (i32.load (i32.add (get_local $state) (get_global $inflate_state.&window))))
    (set_local $hold   (i32.load (i32.add (get_local $state) (get_global $inflate_state.&hold))))
    (set_local $bits   (i32.load (i32.add (get_local $state) (get_global $inflate_state.&bits))))
    (set_local $lcode  (i32.load (i32.add (get_local $state) (get_global $inflate_state.&lencode))))
    (set_local $dcode  (i32.load (i32.add (get_local $state) (get_global $inflate_state.&distcode))))
    (set_local $lmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (i32.add (get_local $state) (get_global $inflate_state.&lenbits)))
        )
        (i32.const 1)
      )
    )
    (set_local $dmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (i32.add (get_local $state) (get_global $inflate_state.&distbits)))
        )
        (i32.const 1)
      )
    )
    ;; decode literals and length/distances until end-of-block or not enough
    ;; input data or output space
    
    block $break
      loop $top
        block $do
          (if (i32.lt_u (get_local $bits) (i32.const 15)) (then
            (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
            (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
            (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
            (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
            (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
            (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
          ))
          ;; $here = $lcode[$hold & $lmask] (codes are 32-bit)
          (set_local $here
            (i32.load
              (i32.add
                (get_local $lcode)
                (i32.shl
                  (i32.and (get_local $hold) (get_local $lmask))
                  (i32.const 2)
                )
              )
            )
          )
          loop $dolen
            ;; $op = $here.bits (2nd-lowest byte)
            (set_local $op
              (i32.and
                (i32.shr_u (get_local $here) (i32.const 8))
                (i32.const 255)
              )
            )
            (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
            (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
            
            ;; $op = $here.op (low byte)
            (set_local $op
              (i32.and
                (get_local $here)
                (i32.const 255)
              )
            )
            (if (i32.eqz (get_local $op)) (then
              ;; literal
              ;; Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
              ;;   "inflate:         literal '%c'\n" :
              ;;   "inflate:         literal 0x%02x\n", here.val));
              
              ;; *out = (unsigned char)($here.val) (low byte of high word)
              (i32.store8 (get_local $out)
                (i32.and
                  (i32.shr_u (get_local $here) (i32.const 16))
                  (i32.const 255)
                )
              )
              ;; out++
              (set_local $out (i32.add (get_local $out) (i32.const 1)))
              (br $do)
            ))
            
            (if (i32.and (get_local $op) (i32.const 16)) (then
              ;; length base
              (set_local $len (i32.shr_u (get_local $here) (i32.const 16)))
              (set_local $op  (i32.and   (get_local $op)   (i32.const 15))) ;; number of extra bits
              (if (get_local $op) (then
                (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $in))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                ))
                (set_local $len
                  (i32.add
                    (get_local $len)
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl
                          (i32.const 1)
                          (get_local $op)
                        )
                        (i32.const 1)
                      )
                    )
                  )
                )
              ))
              ;; Tracevv((stderr, "inflate:         length %u\n", len));
              (if (i32.lt_u (get_local $bits) (i32.const 15)) (then
                (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
                (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
                (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
                (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
                (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
              ))
              ;; $here = $dcode[$hold & $dmask]
              (set_local $here
                (i32.load
                  (i32.add
                    (get_local $dcode)
                    (i32.shl
                      (i32.and (get_local $hold) (get_local $dmask))
                      (i32.const 2)
                    )
                  )
                )
              )
              loop $dodist
                ;; $op = $here.bits
                (set_local $op
                  (i32.and
                    (i32.shr_u (get_local $here) (i32.const 8))
                    (i32.const 255)
                  )
                )
                (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
                (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
                
                ;; $op = $here.op
                (set_local $op
                  (i32.and
                    (get_local $here)
                    (i32.const 255)
                  )
                )
                (if (i32.and (get_local $op) (i32.const 16)) (then
                  ;; distance base
                  (set_local $dist (i32.shr_u (get_local $here) (i32.const 16)))
                  (set_local $op (i32.and (get_local $op) (i32.const 15))) ;; number of extra bits
                  (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                    (set_local $hold
                      (i32.add
                        (get_local $hold)
                        (i32.shl
                          (i32.load8_u (get_local $in))
                          (get_local $bits)
                        )
                      )
                    )
                    (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                    (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                    (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                      (set_local $hold
                        (i32.add
                          (get_local $hold)
                          (i32.shl
                            (i32.load8_u (get_local $in))
                            (get_local $bits)
                          )
                        )
                      )
                      (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                      (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                    ))
                  ))
                  (set_local $dist (i32.add (get_local $dist)
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl (i32.const 1) (get_local $op))
                        (i32.const 1)
                      )
                    )
                  ))
                  (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
                  (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
                  ;; Tracevv((stderr, "inflate:         distance %u\n", dist));
                  (set_local $op (i32.sub (get_local $out) (get_local $beg))) ;; max distance in output
                  (if (i32.gt_u (get_local $dist) (get_local $op)) (then
                    ;; see if copy from window
                    (set_local $op (i32.sub (get_local $dist) (get_local $op))) ;; distance back in window
                    (if (i32.gt_u (get_local $op) (get_local $whave)) (then
                      (if (i32.load (i32.add (get_local $state) (get_global $inflate_state.&sane))) (then
                        ;; strm->msg = (char *)"invalid distance too far back";
                        (i32.store
                          (i32.add (get_local $state) (get_global $inflate_state.&mode))
                          (get_global $BAD)
                        )
                        ;; break;
                        unreachable
                      ))
                    ))
                    (set_local $from (get_local $window))
                    (if (i32.eqz (get_local $wnext)) (then
                      ;; very common case
                      (set_local $from
                        (i32.add
                          (get_local $from)
                          (i32.sub (get_local $wsize) (get_local $op))
                        )
                      )
                      (if (i32.lt_u (get_local $op) (get_local $len)) (then
                        ;; some from window
                        
                        ;; len -= op; do { *out++ = *from++; } while (--op);
                        (set_local $len (i32.sub (get_local $len) (get_local $op)))
                        loop
                          (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                          (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                          (set_local $from (i32.add (get_local $from) (i32.const 1)))
                          (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                        end
                        
                        ;; rest from output
                        (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                      ))
                    )
                    (else
                      (if (i32.lt_u (get_local $wnext) (get_local $op)) (then
                        ;; wrap around window
                        (set_local $from
                          (i32.add
                            (get_local $from)
                            (i32.sub
                              (i32.add (get_local $wsize) (get_local $wnext))
                              (get_local $op)
                            )
                          )
                        )
                        (set_local $op (i32.sub (get_local $op) (get_local $wnext)))
                        (if (i32.lt_u (get_local $op) (get_local $len)) (then
                          ;; some from end of window

                          ;; len -= op; do { *out++ = *from++; } while (--op);
                          (set_local $len (i32.sub (get_local $len) (get_local $op)))
                          loop
                            (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                            (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                            (set_local $from (i32.add (get_local $from) (i32.const 1)))
                            (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                          end

                          (set_local $from (get_local $window))
                          (if (i32.lt_u (get_local $wnext) (get_local $len)) (then
                            ;; some from start of window
                            (set_local $op (get_local $wnext))
                            
                            ;; len -= op; do { *out++ = *from++; } while (--op);
                            (set_local $len (i32.sub (get_local $len) (get_local $op)))
                            loop
                              (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                              (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                              (set_local $from (i32.add (get_local $from) (i32.const 1)))
                              (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                            end
                            
                            ;; rest from output
                            (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                          ))
                        ))
                      )
                      (else
                        ;; contiguous in window
                        (set_local $from
                          (i32.add
                            (get_local $from)
                            (i32.sub (get_local $wnext) (get_local $op))
                          )
                        )
                        (if (i32.lt_u (get_local $op) (get_local $len)) (then
                          ;; some from window
                          
                          ;; len -= op; do { *out++ = *from++; } while (--op);
                          (set_local $len (i32.sub (get_local $len) (get_local $op)))
                          loop
                            (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                            (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                            (set_local $from (i32.add (get_local $from) (i32.const 1)))
                            (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                          end
                          
                          ;; rest from output
                          (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                        ))
                      ))
                    ))
                    block $len_le_2
                      loop
                        (br_if $len_le_2 (i32.le_u (get_local $len) (i32.const 2)))
                        (i32.store8 offset=0 (get_local $out) (i32.load8_u offset=0 (get_local $from)))
                        (i32.store8 offset=1 (get_local $out) (i32.load8_u offset=1 (get_local $from)))
                        (i32.store8 offset=2 (get_local $out) (i32.load8_u offset=2 (get_local $from)))
                        (set_local  $out (i32.add (get_local  $out) (i32.const 3)))
                        (set_local $from (i32.add (get_local $from) (i32.const 3)))
                        (set_local  $len (i32.sub (get_local  $len) (i32.const 3)))
                        br 0
                      end
                    end $len_le_2
                    (if (get_local $len) (then
                      (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                      (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                      (set_local $from (i32.add (get_local $from) (i32.const 1)))
                      (if (i32.gt_u (get_local $len) (i32.const 1)) (then
                        (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                        (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                        (set_local $from (i32.add (get_local $from) (i32.const 1)))
                      ))
                    ))
                    br $do
                  ))
                  (set_local $from (i32.sub (get_local $out) (get_local $dist))) ;; copy direct from output
                  loop
                    ;; minimum length is 3
                    (i32.store8 offset=0 (get_local $out) (i32.load8_u offset=0 (get_local $from)))
                    (i32.store8 offset=1 (get_local $out) (i32.load8_u offset=1 (get_local $from)))
                    (i32.store8 offset=2 (get_local $out) (i32.load8_u offset=2 (get_local $from)))
                    (set_local  $out (i32.add (get_local  $out) (i32.const 3)))
                    (set_local $from (i32.add (get_local $from) (i32.const 3)))
                    (set_local  $len (i32.sub (get_local  $len) (i32.const 3)))
                    (br_if 0 (i32.gt_u (get_local $len) (i32.const 2)))
                  end
                  (if (get_local $len) (then
                    (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                    (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                    (set_local $from (i32.add (get_local $from) (i32.const 1)))
                    (if (i32.gt_u (get_local $len) (i32.const 1)) (then
                      (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                      (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                      (set_local $from (i32.add (get_local $from) (i32.const 1)))
                    ))
                  ))
                  (br $do)
                ))
                (if (i32.eqz (i32.and (get_local $op) (i32.const 64))) (then
                  ;; 2nd level distance code
                  
                  ;; here = dcode[here.val + (hold & ((1U << op) - 1))];
                  (set_local $here (i32.load (get_local $dcode)
                    (i32.shl
                      (i32.add
                        (i32.shr_u (get_local $here) (i32.const 16)) ;; here.val
                        (i32.and
                          (get_local $hold)
                          (i32.sub
                            (i32.shl (i32.const 1) (get_local $op))
                            (i32.const 1)
                          )
                        )
                      )
                      (i32.const 2)
                    )
                  ))

                  (br $dodist)
                ))
                ;; strm->msg = (char *)"invalid distance code";
                ;; state->mode = BAD;
                ;; break
                unreachable
              end ;; loop $dodist
            ))
            (if (i32.eqz (i32.and (get_local $op) (i32.const 64))) (then
              ;; 2nd level length code
              
              ;; here = lcode[here.val + (hold & ((1U << op) - 1))];
              (set_local $here (i32.load (get_local $lcode)
                (i32.shl
                  (i32.add
                    (i32.shr_u (get_local $here) (i32.const 16)) ;; here.val
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl (i32.const 1) (get_local $op))
                        (i32.const 1)
                      )
                    )
                  )
                  (i32.const 2)
                )
              ))
              
              (br $dolen)
            ))
            (if (i32.and (get_local $op) (i32.const 32)) (then
              ;; end of block
              ;; Tracevv((stderr, "inflate:         end of block\n"));
              (i32.store
                (i32.add (get_local $state) (get_global $inflate_state.&mode))
                (get_global $TYPE)
              )
              (br $break)
            ))
            ;; strm->msg = (char *)"invalid literal/length code";
            (i32.store
              (i32.add (get_local $state) (get_global $inflate_state.&mode))
              (get_global $BAD)
            )
            ;; break
            unreachable
          end ;; loop $dolen
        end $do
        (br_if $top
          (i32.and
            (i32.lt_u (get_local  $in) (get_local $last))
            (i32.lt_u (get_local $out) (get_local  $end))
          )
        )
      end ;; loop $top
    end $break

    ;; return unused bytes (on entry, $bits < 8, so $in won't go too far back)
    (set_local  $len (i32.shr_u (get_local $bits) (i32.const 3)))
    (set_local   $in (i32.sub   (get_local   $in) (get_local $len)))
    (set_local $bits (i32.sub   (get_local $bits) (i32.shl (get_local $len) (i32.const 3))))
    (set_local $hold
      (i32.and
        (get_local $hold)
        (i32.sub (i32.shl (i32.const 1) (get_local $bits)) (i32.const 1))
      )
    )

    ;; update state and return
    
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_in)) (get_local $in))
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_out)) (get_local $out))
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_in))
      (select
        (i32.sub (i32.const 5) (i32.sub (get_local $in) (get_local $last)))
        (i32.add (i32.const 5) (i32.sub (get_local $last) (get_local $in)))
        (i32.lt_u (get_local $in) (get_local $last))
      )
    )
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_out))
      (select
        (i32.add (i32.const 257) (i32.sub (get_local $end) (get_local $out)))
        (i32.sub (i32.const 257) (i32.sub (get_local $out) (get_local $end)))
        (i32.lt_u (get_local $out) (get_local $end))
      )
    )
    (i32.store
      (i32.add (get_local $state) (get_global $inflate_state.&hold))
      (get_local $hold)
    )
    (i32.store
      (i32.add (get_local $state) (get_global $inflate_state.&bits))
      (get_local $bits)
    )
  )
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L642 ;)
  (func $order (param $i i32) (result i32)
    ;; inline const short array in C version
    block $18 block $17 block $16 block $15 block $14 block $13 block $12 block $11 block $10
    block  $9 block  $8 block  $7 block  $6 block  $5 block  $4 block  $3 block  $2 block  $1
    block  $0
    
    (get_local $i)
    br_table $16 $17 $18 $0 $8 $7 $9 $6 $10 $5 $11 $4 $12 $3 $13 $2 $14 $1 $15
    
    end $0 (return (i32.const 0))
    end $1 (return (i32.const 1))
    end $2 (return (i32.const 2))
    end $3 (return (i32.const 3))
    end $4 (return (i32.const 4))
    end $5 (return (i32.const 5))
    end $6 (return (i32.const 6))
    end $7 (return (i32.const 7))
    end $8 (return (i32.const 8))
    end $9 (return (i32.const 9))
    end $10 (return (i32.const 10))
    end $11 (return (i32.const 11))
    end $12 (return (i32.const 12))
    end $13 (return (i32.const 13))
    end $14 (return (i32.const 14))
    end $15 (return (i32.const 15))
    end $16 (return (i32.const 16))
    end $17 (return (i32.const 17))
    end $18 (return (i32.const 18))
  )
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L622 ;)
  (func $inflate (param $strm i32) (param $flush i32) (result i32)
    (local $state i32)
    (local $next i32)
    (local $put i32)
    (local $have i32)
    (local $left i32)
    (local $hold i32)
    (local $bits i32)
    (local $in i32)
    (local $out i32)
    (local $copy i32)
    (local $from i32)
    (local $here i32)
    (local $len i32)
    (local $ret i32)
    (local $hbuf i32) ;; unsigned char[4]
    (local $_temp_bits i32) ;; for NEEDBITS et al
    ;; $order is a function, see above
    
    (;
      ;; macro templates
      
      (;LOAD;)
        (set_local $put (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_out))))
        (set_local $left (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_out))))
        (set_local $next (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_in))))
        (set_local $have (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in))))
        (set_local $hold (i32.load (i32.add (get_local $state) (get_global $inflate_state.&hold))))
        (set_local $bits (i32.load (i32.add (get_local $state) (get_global $inflate_state.&bits))))
      (;LOAD;)

      (;RESTORE;)
        (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_out)) (get_local $put))
        (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_out)) (get_local $left))
        (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_in)) (get_local $next))
        (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_in)) (get_local $have))
        (i32.store (i32.add (get_local $state) (get_global $inflate_state.&hold)) (get_local $hold))
        (i32.store (i32.add (get_local $state) (get_global $inflate_state.&bits)) (get_local $bits))
      (;/RESTORE;)

      (;PULLBYTE;)
        (br_if $inf_leave (i32.eqz (get_local $have)))
        (set_local $have (i32.sub (get_local $have) (i32.const 1)))
        (set_local $hold
          (i32.add
            (get_local $hold)
            (i32.shl
              (i32.load8_u (get_local $next))
              (get_local $bits)
            )
          )
        )
        (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
      (;/PULLBYTE;)

      (set_local $_temp_bits (...)) (;NEEDBITS;)
        block
          loop
            (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
            (;PULLBYTE;)
              (br_if $inf_leave (i32.eqz (get_local $have)))
              (set_local $have (i32.sub (get_local $have) (i32.const 1)))
              (set_local $hold
                (i32.add
                  (get_local $hold)
                  (i32.shl
                    (i32.load8_u (get_local $next))
                    (get_local $bits)
                  )
                )
              )
              (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
            (;/PULLBYTE;)
            br 0
          end
        end
      (;/NEEDBITS;)

      (set_local $_temp_bits (...)) (;BITS;)
        (set_local $_temp_bits)
        (i32.and
          (get_local $hold)
          (i32.sub
            (i32.shl
              (i32.const 1)
              (get_local $_temp_bits)
            )
            (i32.const 1)
          )
        )
      (;/BITS;) (...)

      (set_local $_temp_bits (...))  (;DROPBITS;)
        (set_local $hold (i32.shr_u (get_local $hold) (get_local $_temp_bits)))
        (set_local $bits (i32.sub   (get_local $bits) (get_local $_temp_bits)))
      (;/DROPBITS;)

      (;BYTEBITS;)
        (set_local $hold (i32.shr_u (get_local $hold) (i32.and (get_local $bits) (i32.const 7))))
        (set_local $bits (i32.sub   (get_local $bits) (i32.and (get_local $bits) (i32.const 7))))
      (;/BYTEBITS;)
      
    ;)
    
    ;; TODO: up to https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L651
    
    (;LOAD;)
      (set_local $put (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_out))))
      (set_local $left (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_out))))
      (set_local $next (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_in))))
      (set_local $have (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in))))
      (set_local $hold (i32.load (i32.add (get_local $state) (get_global $inflate_state.&hold))))
      (set_local $bits (i32.load (i32.add (get_local $state) (get_global $inflate_state.&bits))))
    (;LOAD;)
    
    (set_local $in (get_local $have))
    (set_local $out (get_local $left))
    (set_local $ret (get_global $Z_OK))
        
    block $inf_leave
      loop $continue
      
        ;; this is what a big ol' switch table looks like in wasm. better get used to it
        
        block $SYNC:default: block $MEM:     block $BAD:     block $DONE: block $LENGTH: block $CHECK:
        block $LIT:          block $MATCH:   block $DISTEXT: block $DIST: block $LENEXT: block $LEN:   block $LEN_:
        block $CODELENS:     block $LENLENS: block $TABLE:   block $COPY: block $COPY_:
        block $STORED:       block $TYPEDO:  block $TYPE:    block $DICT: block $DICTID: block $HCRC:  block $COMMENT:
        block $NAME:         block $EXTRA:   block $EXLEN:   block $OS:   block $TIME:   block $FLAGS: block $HEAD:
      
        (i32.load (i32.add (get_local $state) (get_global $inflate_state.&mode)))
        (i32.sub (get_global $HEAD))
        br_table
          $HEAD: $FLAGS: $TIME: $OS: $EXLEN: $EXTRA: $NAME: $COMMENT: $HCRC: $DICTID: $DICT:
            $TYPE: $TYPEDO: $STORED: $COPY_: $COPY: $TABLE: $LENLENS: $CODELENS:
              $LEN_: $LEN: $LENEXT: $DIST: $DISTEXT: $MATCH: $LIT:
          $CHECK: $LENGTH: $DONE: $BAD: $MEM: $SYNC:default:
        
        end $HEAD: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L657 ;)
          (if (i32.eqz (i32.load (i32.add (get_local $state) (get_global $inflate_state.&wrap)))) (then
            (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $TYPEDO))
            br $TYPEDO:
          ))
          
          (set_local $_temp_bits (i32.const 16)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE;)
                br 0
              end
            end
          (;/NEEDBITS;)
          
          unreachable
        end $FLAGS: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L706 ;)
        
          (set_local $_temp_bits (i32.const 16)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE;)
                br 0
              end
            end
          (;/NEEDBITS;)
          
          unreachable
        end $TIME: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L725 ;)
        
          (set_local $_temp_bits (i32.const 32)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE;)
                br 0
              end
            end
          (;/NEEDBITS;)
          
          unreachable
        end $OS: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L733 ;)
        
          (set_local $_temp_bits (i32.const 16)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE();)
                br 0
              end
            end
          (;/NEEDBITS(n);)
          
          unreachable
        end $EXLEN: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L743 ;)
          unreachable
        end $EXTRA: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L756 ;)
          unreachable
        end $NAME: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L778 ;)
          unreachable
        end $COMMENT: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L799 ;)
          unreachable
        end $HCRC: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L819 ;)
          unreachable
        end $DICTID: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L837 ;)
        
          (set_local $_temp_bits (i32.const 32)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE;)
                br 0
              end
            end
          (;/NEEDBITS;)
          
          (;$_temp_bits=ZSWAP($hold);)
          (set_local $_temp_bits
            (i32.or
              (i32.shr_u (get_local $hold) (i32.const 24))
              (i32.or
                (i32.and (i32.shr_u (get_local $hold) (i32.const 8)) (i32.const 0x0000ff00))
                (i32.or
                  (i32.and (i32.shl (get_local $hold) (i32.const 8)) (i32.const 0x00ff0000))
                  (i32.shl (get_local $hold) (i32.const 24))
                )
              )
            )
          )
          (;/$_temp_bits=ZSWAP($hold);)
          
          (i32.store (i32.add (get_local  $strm) (get_global      $z_stream.&adler)) (get_local $_temp_bits))
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&check)) (get_local $_temp_bits))
          
          (;INITBITS;)
            (set_local $hold (i32.const 0))
            (set_local $bits (i32.const 0))
          (;/INITBITS;)
        
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $DICT))
          ;; fall through:
        end $DICT: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L842 ;)
          (if (i32.eqz (i32.load (i32.add (get_local $state) (get_global $inflate_state.&havedict)))) (then
            (;RESTORE;)
              (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_out)) (get_local $put))
              (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_out)) (get_local $left))
              (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_in)) (get_local $next))
              (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_in)) (get_local $have))
              (i32.store (i32.add (get_local $state) (get_global $inflate_state.&hold)) (get_local $hold))
              (i32.store (i32.add (get_local $state) (get_global $inflate_state.&bits)) (get_local $bits))
            (;/RESTORE;)
            (return (get_global $Z_NEED_DICT))
          ))
          
          (i32.store (i32.add (get_local  $strm) (get_global      $z_stream.&adler)) (get_global $adler32_initial))
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&check)) (get_global $adler32_initial))
          
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $TYPE))
          ;; fall through:
        end $TYPE: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L849 ;)
          (br_if $inf_leave (i32.or
            (i32.eq (get_local $flush) (get_global $Z_BLOCK))
            (i32.eq (get_local $flush) (get_global $Z_TREES))
          ))
          ;; fall through:
        end $TYPEDO: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L851 ;)
          (if (i32.load (i32.add (get_local $state) (get_global $inflate_state.&last))) (then
            (;BYTEBITS;)
              (set_local $hold (i32.shr_u (get_local $hold) (i32.and (get_local $bits) (i32.const 7))))
              (set_local $bits (i32.sub   (get_local $bits) (i32.and (get_local $bits) (i32.const 7))))
            (;/BYTEBITS;)
            (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $CHECK))
            br $CHECK:
          ))
          unreachable
        end $STORED: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L887 ;)
        
          (;BYTEBITS;)
            (set_local $hold (i32.shr_u (get_local $hold) (i32.and (get_local $bits) (i32.const 7))))
            (set_local $bits (i32.sub   (get_local $bits) (i32.and (get_local $bits) (i32.const 7))))
          (;/BYTEBITS;)
          
          (set_local $_temp_bits (i32.const 32)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE;)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE;)
                br 0
              end
            end
          (;/NEEDBITS;)
        
          unreachable
        end $COPY_: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L901 ;)
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $COPY))
          ;; fall through:
        end $COPY: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L903 ;)
          (set_local $copy (i32.load (i32.add (get_local $state) (get_global $inflate_state.&length))))
          unreachable
        end $TABLE: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L920 ;)
        
          (set_local $_temp_bits (i32.const 14)) (;NEEDBITS;)
            block
              loop
                (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                (;PULLBYTE();)
                  (br_if $inf_leave (i32.eqz (get_local $have)))
                  (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $next))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (;/PULLBYTE();)
                br 0
              end
            end
          (;/NEEDBITS(n);)
          
          (i32.const 257)
          (set_local $_temp_bits (i32.const 5)) (;BITS;)
            (i32.and
              (get_local $hold)
              (i32.sub
                (i32.shl
                  (i32.const 1)
                  (get_local $_temp_bits)
                )
                (i32.const 1)
              )
            )
          (;/BITS;)
          (i32.add)
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&nlen)))
          (;DROPBITS;)
            (set_local $hold (i32.shr_u (get_local $hold) (get_local $_temp_bits)))
            (set_local $bits (i32.sub   (get_local $bits) (get_local $_temp_bits)))
          (;/DROPBITS;)
          
          (i32.const 1)
          (set_local $_temp_bits (i32.const 5)) (;BITS;)
            (i32.and
              (get_local $hold)
              (i32.sub
                (i32.shl
                  (i32.const 1)
                  (get_local $_temp_bits)
                )
                (i32.const 1)
              )
            )
          (;/BITS(n);)
          (i32.add)
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&ndist)))
          (;DROPBITS;)
            (set_local $hold (i32.shr_u (get_local $hold) (get_local $_temp_bits)))
            (set_local $bits (i32.sub   (get_local $bits) (get_local $_temp_bits)))
          (;/DROPBITS;)
          
          (i32.const 4)
          (i32.const 4) (;BITS(n);)
            (set_local $_temp_bits)
            (i32.and
              (get_local $hold)
              (i32.sub
                (i32.shl
                  (i32.const 1)
                  (get_local $_temp_bits)
                )
                (i32.const 1)
              )
            )
          (;/BITS(n);)
          (i32.add)
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&ncode)))
          (;DROPBITS;)
            (set_local $hold (i32.shr_u (get_local $hold) (get_local $_temp_bits)))
            (set_local $bits (i32.sub   (get_local $bits) (get_local $_temp_bits)))
          (;/DROPBITS;)
          
          ;; #ifndef PKZIP_BUG_WORKAROUND
          ;; if (state->nlen > 286 || state->ndist > 30) {
          ;;   strm->msg = (char *)"too many length or distance symbols";
          ;;   state->mode = BAD;
          ;;   break;
          ;; }
          ;; #endif
          ;; Tracev((stderr, "inflate:       table sizes ok\n"));
          
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&have)) (i32.const 0))
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $LENLENS))
          
          ;; fall through:
        end $LENLENS: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L938 ;)
          unreachable
        end $CODELENS: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L959 ;)
          unreachable
        end $LEN_: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1042 ;)
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $LEN))
          ;; fall through:
        end $LEN: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1044 ;)
          unreachable
        end $LENEXT: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1093 ;)
          (if (tee_local $_temp_bits (i32.load (i32.add (get_local $state) (get_global $inflate_state.&extra)))) (then
            
            (;NEEDBITS;)
              block
                loop
                  (br_if 1 (i32.ge_u (get_local $bits) (get_local $_temp_bits)))
                  (;PULLBYTE;)
                    (br_if $inf_leave (i32.eqz (get_local $have)))
                    (set_local $have (i32.sub (get_local $have) (i32.const 1)))
                    (set_local $hold
                      (i32.add
                        (get_local $hold)
                        (i32.shl
                          (i32.load8_u (get_local $next))
                          (get_local $bits)
                        )
                      )
                    )
                    (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                  (;/PULLBYTE;)
                  br 0
                end
              end
            (;/NEEDBITS;)

            (i32.load (i32.add (get_local $state) (get_global $inflate_state.&length)))
            (;BITS;)
              (i32.and
                (get_local $hold)
                (i32.sub
                  (i32.shl
                    (i32.const 1)
                    (get_local $_temp_bits)
                  )
                  (i32.const 1)
                )
              )
            (;/BITS;)
            i32.add
            (i32.store (i32.add (get_local $state) (get_global $inflate_state.&length)))

            (;DROPBITS;)
              (set_local $hold (i32.shr_u (get_local $hold) (get_local $_temp_bits)))
              (set_local $bits (i32.sub   (get_local $bits) (get_local $_temp_bits)))
            (;/DROPBITS;)
            
            (i32.load (i32.add (get_local $state) (get_global $inflate_state.&back)))
            (get_local $_temp_bits)
            i32.add
            (i32.store (i32.add (get_local $state) (get_global $inflate_state.&back)))
          ))
        
          ;; Tracevv((stderr, "inflate:         length %u\n", state->length));
          
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&was))
            (i32.load (i32.add (get_local $state) (get_global $inflate_state.&length)))
          )
          
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $DIST))
        
          ;; fall through:
        end $DIST: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1103 ;)
          unreachable
        end $DISTEXT: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1130 ;)
          unreachable
        end $MATCH: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1146 ;)
          unreachable
        end $LIT: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1191 ;)
          (br_if $inf_leave (i32.eqz (get_local $left)))
          (i32.store8 (get_local $put) (i32.load (i32.add (get_local $state) (get_global $inflate_state.&length))))
          (set_local $left (i32.sub (get_local $left) (i32.const 1)))
          (i32.store (i32.add (get_local $state) (get_global $inflate_state.&mode)) (get_global $LEN))
          br $continue
        end $CHECK: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1197 ;)
          unreachable
        end $LENGTH: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1221 ;)
          unreachable
        end $DONE: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1234 ;)
          (set_local $ret (get_global $Z_STREAM_END))
          br $inf_leave
        end $BAD: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1237 ;)
          (set_local $ret (get_global $Z_DATA_ERROR))
          br $inf_leave
        end $MEM: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1240 ;)
          (return (get_global $Z_MEM_ERROR))
        end $SYNC:default: (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1242 ;)
          (return (get_global $Z_STREAM_ERROR))
      end
    end $inf_leave
    (;RESTORE;)
      (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_out)) (get_local $put))
      (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_out)) (get_local $left))
      (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_in)) (get_local $next))
      (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_in)) (get_local $have))
      (i32.store (i32.add (get_local $state) (get_global $inflate_state.&hold)) (get_local $hold))
      (i32.store (i32.add (get_local $state) (get_global $inflate_state.&bits)) (get_local $bits))
    (;/RESTORE;)
    ;; TODO: from https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L1255
    (return (get_local $ret))
  )
)
