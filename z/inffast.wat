(module

  ;; stream:
  ;;  offset=0 next_in
  ;;  offset=4 avail_in
  ;;  offset=8 total_in
  ;;  offset=12 next_out
  ;;  offset=16 avail_out
  ;;  offset=20 total_out
  ;;  offset=24 msg
  ;;  offset=28 state

  ;; state: (note: recent inflate.h has added strm reference as first field)
  ;;  offset=0  mode
  ;;  offset=4  last
  ;;  offset=8  wrap
  ;;  offset=12 havedict
  ;;  offset=16 flags
  ;;  offset=20 dmax
  ;;  offset=24 check
  ;;  offset=28 total
  ;;  offset=32 head
  ;;  offset=36 wbits
  ;;  offset=40 wsize
  ;;  offset=44 whave
  ;;  offset=48 wnext
  ;;  offset=52 window
  ;;  offset=56 hold
  ;;  offset=60 bits
  ;;  offset=64 length
  ;;  offset=68 offset
  ;;  offset=72 extra
  ;;  offset=76 lencode
  ;;  offset=80 distcode
  ;;  offset=84 lenbits
  ;;  offset=88 distbits
  ;;  offset=92 ncode
  ;;  offset=96 nlen
  ;;  offset=100 ndist
  ;;  offset=104 have
  ;;  offset=108 next
  ;;  offset=112 lens[320]
  ;;  offset=752 work[288]
  ;;  offset=1328 codes[1444]
  ;;  offset=7104 sane
  ;;  offset=7108 back
  ;;  offset=7112 was
  ;; length:7116
  
  (func $inflate_fast
      (param $strm i32)
      (param $start i32) ;; inflate()'s starting value for strm->avail_out
    (local $state i32)
    (local $in i32)      ;; local strm->next_in
    (local $last i32)    ;; have enough input while $in < $last
    (local $out i32)     ;; local strm->next_out
    (local $beg i32)     ;; inflate()'s initial strm->next_out
    (local $end i32)     ;; while $out < $end, enough space available
    (local $wsize i32)   ;; window size or zero if not using window
    (local $whave i32)   ;; valid bytes in the window
    (local $wnext i32)   ;; window write index
    (local $window i32)  ;; allocated sliding window, if wsize != 0
    (local $hold i32)    ;; local strm->hold
    (local $bits i32)    ;; local strm->bits
    (local $lcode i32)   ;; local strm->lencode
    (local $dcode i32)   ;; local strm->distcode
    (local $lmask i32)   ;; mask for first level of length codes
    (local $dmask i32)   ;; mask for first level of distance codes
    (local $here i32)    ;; retrieved table entry
    (local $op i32)      ;; code bits, operation, extra bits, or window position, window bytes to copy
    (local $len i32)     ;; match length, unused bytes
    (local $dist i32)    ;; match distance
    (local $from i32)    ;; where to copy match from
    
    ;; copy state to local variables
    (set_local $state   (i32.load (; state ;)    offset=28 (get_local $strm)))
    (set_local $in      (i32.load (; next_in ;)  offset=0  (get_local $strm)))
    (set_local $last
      (i32.add
        (get_local $in)
        (i32.sub
                        (i32.load (; avail_in ;) offset=4  (get_local $strm))
                        (i32.const 5)
        )
      )
    )
    (set_local $out     (i32.load (; next_out ;) offset=12 (get_local $strm)))
    (set_local $beg
      (i32.sub
        (get_local $out)
        (i32.sub
                        (get_local $start)
                        (i32.load (; avail_out ;) offset=16 (get_local $strm))
        )
      )
    )
    (set_local $end
      (i32.add
        (get_local $out)
        (i32.sub
                        (i32.load (; avail_out ;) offset=16 (get_local $strm))
                        (i32.const 257)
        )
      )
    )
    (set_local $wsize  (i32.load (; wsize ;)     offset=40 (get_local $state)))
    (set_local $whave  (i32.load (; whave ;)     offset=44 (get_local $state)))
    (set_local $wnext  (i32.load (; wnext ;)     offset=48 (get_local $state)))
    (set_local $window (i32.load (; window ;)    offset=52 (get_local $state)))
    (set_local $hold   (i32.load (; hold ;)      offset=56 (get_local $state)))
    (set_local $bits   (i32.load (; bits ;)      offset=60 (get_local $state)))
    (set_local $lcode  (i32.load (; lencode ;)   offset=76 (get_local $state)))
    (set_local $dcode  (i32.load (; distcode ;)  offset=80 (get_local $state)))
    (set_local $lmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (; lenbits ;) offset=84 (get_local $state))
        )
        (i32.const 1)
      )
    )
    (set_local $dmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (; distbits ;) offset=88 (get_local $state))
        )
        (i32.const 1)
      )
    )
    ;; decode literals and length/distances until end-of-block or not enough
    ;; input data or output space
    
    loop $do
(;

        if (bits < 15) {
            hold += (unsigned long)(*in++) << bits;
            bits += 8;
            hold += (unsigned long)(*in++) << bits;
            bits += 8;
        }
        here = lcode[hold & lmask];
      dolen:
        op = (unsigned)(here.bits);
        hold >>= op;
        bits -= op;
        op = (unsigned)(here.op);
        if (op == 0) {                          /* literal */
            Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
                    "inflate:         literal '%c'\n" :
                    "inflate:         literal 0x%02x\n", here.val));
            *out++ = (unsigned char)(here.val);
        }
        else if (op & 16) {                     /* length base */
            len = (unsigned)(here.val);
            op &= 15;                           /* number of extra bits */
            if (op) {
                if (bits < op) {
                    hold += (unsigned long)(*in++) << bits;
                    bits += 8;
                }
                len += (unsigned)hold & ((1U << op) - 1);
                hold >>= op;
                bits -= op;
            }
            Tracevv((stderr, "inflate:         length %u\n", len));
            if (bits < 15) {
                hold += (unsigned long)(*in++) << bits;
                bits += 8;
                hold += (unsigned long)(*in++) << bits;
                bits += 8;
            }
            here = dcode[hold & dmask];
          dodist:
            op = (unsigned)(here.bits);
            hold >>= op;
            bits -= op;
            op = (unsigned)(here.op);
            if (op & 16) {                      /* distance base */
                dist = (unsigned)(here.val);
                op &= 15;                       /* number of extra bits */
                if (bits < op) {
                    hold += (unsigned long)(*in++) << bits;
                    bits += 8;
                    if (bits < op) {
                        hold += (unsigned long)(*in++) << bits;
                        bits += 8;
                    }
                }
                dist += (unsigned)hold & ((1U << op) - 1);
                hold >>= op;
                bits -= op;
                Tracevv((stderr, "inflate:         distance %u\n", dist));
                op = (unsigned)(out - beg);     /* max distance in output */
                if (dist > op) {                /* see if copy from window */
                    op = dist - op;             /* distance back in window */
                    if (op > whave) {
                        if (state->sane) {
                            strm->msg =
                                (char *)"invalid distance too far back";
                            state->mode = BAD;
                            break;
                        }
#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
                        if (len <= op - whave) {
                            do {
                                *out++ = 0;
                            } while (--len);
                            continue;
                        }
                        len -= op - whave;
                        do {
                            *out++ = 0;
                        } while (--op > whave);
                        if (op == 0) {
                            from = out - dist;
                            do {
                                *out++ = *from++;
                            } while (--len);
                            continue;
                        }
#endif
                    }
                    from = window;
                    if (wnext == 0) {           /* very common case */
                        from += wsize - op;
                        if (op < len) {         /* some from window */
                            len -= op;
                            do {
                                *out++ = *from++;
                            } while (--op);
                            from = out - dist;  /* rest from output */
                        }
                    }
                    else if (wnext < op) {      /* wrap around window */
                        from += wsize + wnext - op;
                        op -= wnext;
                        if (op < len) {         /* some from end of window */
                            len -= op;
                            do {
                                *out++ = *from++;
                            } while (--op);
                            from = window;
                            if (wnext < len) {  /* some from start of window */
                                op = wnext;
                                len -= op;
                                do {
                                    *out++ = *from++;
                                } while (--op);
                                from = out - dist;      /* rest from output */
                            }
                        }
                    }
                    else {                      /* contiguous in window */
                        from += wnext - op;
                        if (op < len) {         /* some from window */
                            len -= op;
                            do {
                                *out++ = *from++;
                            } while (--op);
                            from = out - dist;  /* rest from output */
                        }
                    }
                    while (len > 2) {
                        *out++ = *from++;
                        *out++ = *from++;
                        *out++ = *from++;
                        len -= 3;
                    }
                    if (len) {
                        *out++ = *from++;
                        if (len > 1)
                            *out++ = *from++;
                    }
                }
                else {
                    from = out - dist;          /* copy direct from output */
                    do {                        /* minimum length is three */
                        *out++ = *from++;
                        *out++ = *from++;
                        *out++ = *from++;
                        len -= 3;
                    } while (len > 2);
                    if (len) {
                        *out++ = *from++;
                        if (len > 1)
                            *out++ = *from++;
                    }
                }
            }
            else if ((op & 64) == 0) {          /* 2nd level distance code */
                here = dcode[here.val + (hold & ((1U << op) - 1))];
                goto dodist;
            }
            else {
                strm->msg = (char *)"invalid distance code";
                state->mode = BAD;
                break;
            }
        }
        else if ((op & 64) == 0) {              /* 2nd level length code */
            here = lcode[here.val + (hold & ((1U << op) - 1))];
            goto dolen;
        }
        else if (op & 32) {                     /* end-of-block */
            Tracevv((stderr, "inflate:         end of block\n"));
            state->mode = TYPE;
            break;
        }
        else {
            strm->msg = (char *)"invalid literal/length code";
            state->mode = BAD;
            break;
        }
   ;)
      (br_if $do
        (i32.and
          (i32.lt (get_local $in)  (get_local $last) )
          (i32.lt (get_local $out) (get_local $end)  )
        )
      )
    end

    ;; return unused bytes (on entry, bits < 8, so in won't go too far back)
    (set_local $len (i32.shr_u (get_local $bits) (i32.const 3)))
    (set_local $in (i32.sub (get_local $in) (get_local $len)))
    (set_local $bits (i32.sub (get_local $bits) (bit.shl (get_local $len) (i32.const 3))))
    (set_local $hold (i32.and (i32.sub (i32.shl (i32.const 1) (get_local $bits)) (i32.const 1))))

    ;; update state and return
    (i32.store (; next_in ;)  offset=0  (get_local $strm) (get_local $in))
    (i32.store (; next_out ;) offset=12 (get_local $strm) (get_local $out))
    (i32.store (; avail_in ;) offset=4 (get_local $strm)
      (select
        (i32.sub (i32.const 5) (i32.sub (get_local $in) (get_local $last)))
        (i32.add (i32.const 5) (i32.sub (get_local $last) (get_local $in)))
        (i32.lt_u (get_local $in) (get_local $last))
      )
    )
    (i32.store (; avail_out ;) offset=16 (get_local $strm)
      (select
        (i32.add (i32.const 257) (i32.sub (get_local $end) (get_local $out)))
        (i32.sub (i32.const 257) (i32.sub (get_local $out) (get_local $end)))
        (i32.lt_u (get_local $out) (get_local $end))
      )
    )
    (i32.store (; hold ;) offset=56 (get_local $state) (get_local $hold))
    (i32.store (; bits ;) offset=60 (get_local $state) (get_local $bits))
  )
)
