var http = require('http'),
    express = require('express');
var app = express();
var fs = require('fs');
var Grid = require('gridfs-stream');
var bodyParser = require('body-parser');
var multiparty = require('multiparty');


app.get('/', function (req, res) {
    res.send('OneDay');
    console.log('\nOneDay');
});


var server = http.createServer(app).listen(process.env.PORT || 5000);
var multer = require('multer');
var upload = multer({ dest: 'uploads/' });


var io = require('socket.io').listen(server);

// app.use(express.bodyParser());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json({limit: '50mb'}));
// app.use(bodyParser.urlencoded({limit: '50mb'}));

var mongoose = require('mongoose');
mongoose.connect('mongodb://windsoft:lee7945132@ds047622.mongolab.com:47622/heroku_lj11hr24');
var conn = mongoose.connection;

var ObjectId = mongoose.Schema.ObjectId

var userSchema = mongoose.Schema({
    user_id : String,
    image : String,
    name : String,
    pw : String,
    birth : Date,
    mail : String,
    friends: [ObjectId],
    good : [ObjectId],
    bad : [ObjectId],
    comment : [{ notice_id : ObjectId, content : String }],
    notice : [ObjectId],
    delete_comment : [{ notice_id: String, content: String, time : Date }]
});

var noticeSchema = mongoose.Schema({
    notice_id : ObjectId,
    user_id : String,
    user_img : String,
    name : String,
    content : String,
    date : Date,
    img : [String],
    comment : [{ user_id: String, user_img:String, content: String, date : Date, name : String }],
    good : [String],
    bad : [String],
    delete_comment : [{ user_id: String, content: String, date : Date }]
});


var userModel = mongoose.model('user', userSchema);
var noticeModel = mongoose.model('notice', noticeSchema);


Grid.mongo = mongoose.mongo;
var gfs;

conn.once('open', function() {
    console.log('mongoose open');
    gfs = Grid(conn.db);
});


app.post('/upload_profile_image', function(req, res) {
    fs.readFile(req.files.uploadFile.path, function(err, data) {
        var filePath = __dirname + "\\files\\" + req.files.uploadFile.name;
        fs.writeFile(filePath, data, function(err) {
            if (err) {
                console.log('file write err = ' + err);
            } else {
                res.writeHead(200)
                res.end()
            }
        });
    });
});

app.post('/upload_images', function(req, res) {

    var form = new multiparty.Form();
    var noticeId;
    var filename;

    form.on('field', function(name, value) {
        console.log('normal field / name = ' + name + ' value = ' + value);
        if (name == "noticeId") {
            noticeId = value;
            console.log('noticeId = ' + noticeId);

            noticeModel.findOneAndUpdate({'notice_id': noticeId}, {$push: { 'img': filename }}, function(err) {
                if (err) {
                    console.log('insertImage error ' + err);
                    res.status(500).send('fail ' + err);
                    return;
                }
            });
        }
    });

    // file upload handling
      form.on('part',function(part){
           var size;

           if (part.filename) {
                 filename = part.filename;
                 size = part.byteCount;
           } else {
                part.resume();
           }

           var date = new Date();
           filename = date.getTime() + '_' + filename;
 
           console.log("Write Streaming file :"+filename);
           var writeStream = gfs.createWriteStream('/images/'+filename);
           writeStream.filename = filename;
           part.pipe(writeStream);
 
           part.on('data',function(chunk){
                 console.log(filename+' read '+chunk.length + 'bytes');
           });
          
           part.on('end',function(){
                 console.log(filename+' Part read complete');
                 writeStream.end();
           });
      });
 
      // all uploads are completed
      form.on('close',function() {
        console.log('Close');
           res.status(200).send('Upload complete');
      });
     
      // track progress
      form.on('progress',function(byteRead,byteExpected){
           console.log(' Reading total  '+byteRead+'/'+byteExpected);
      });
     
      form.parse(req);
});

app.get('/images/:filename', function(req, res) {
    fs.readdir(__dirname + '/images', function(err, data) {
        if (err) {
            console.log('error ' + err);
            res.status(500).send('Fail');
            return;
        } else {
            gfs.exist({
                filename: req.params.filename
            }, function(err, found) {
                if (err) {
                    console.log('error ' + err);
                    res.status(500).send('Fail');
                    return;
                } else {
                    gfs.createReadStream({
                        filename: req.params.filename
                    }).pipe(res);
                }
            })
        }
    });
});





setInterval(function () {
    noticeModel.find({}, function (err, data) {
        if (err) {
            console.log('interval error = ' + err);
        } else {
            console.log('interval length = ' + data.length);
            for (var i = 0; i < data.length; i++) {
                var good = data[i].good;
                var bad = data[i].bad;
                var goodNum = good.length;
                var badNum = bad.length;
                
                var date = new Date();
                date.setDate(date.getDate() - 1);
                date.setMinutes(date.getMinutes() + 3 * goodNum);
                date.setMinutes(date.getMinutes() - 3 * badNum);
                
                if (data[i].date.getTime() < date.getTime()) {                      // 좋아요 싫어요 계산 후에도 시간이 지난 게시글 삭제
                    var noticeId = data[i].notice_id;
                    var comment = data[i].comment;
                    var user = data[i].user_id;
                    
                    
                    userModel.findOneAndUpdate({ 'user_id' : user }, { $pull : { 'notice' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n Remove Notice Error = ' + err);
                        }
                    });

                    
                    for (var j = 0; j < comment.length; j++) {
                        var userId = comment[j].user_id;
                        console.log('\n comment userId = ' + userId);
                        userModel.findOne({ 'user_id' : userId }, function (err, userData) {
                            if (err) {
                                console.log('\n Remove Comment Error = ' + err);
                            } else {
                                var commentList = userData.comment;
                                
                                for (var k = 0; k < commentList.length; k++) {
                                    var commentNotice = commentList[k];
                                    var noticeIdStr = noticeId.toHexString();
                                    var commentNoticeStr = commentNotice.notice_id.toHexString();
                                    if (commentNotice.notice_id.equals(noticeId)) {
                                        console.log('\n Equal');
                                        commentList.splice(k, 1);
                                        k--;
                                    }

                                    if (k == commentList.length - 1) {
                                        console.log('\n end');
                                        userData.comment = commentList;
                                        userData.save(function (err) {
                                            if (err) {
                                                console.log('\n Remove Comment Error2 = ' + err);
                                            }
                                        });
                                    }
                                }
                            }
                        });
                    }
                    
                    for (var j = 0; j < good.length; j++) {
                        var userId = good[j];
                        userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'good' : noticeId } }, function (err, userData) {
                            if (err) {
                                console.log('\n Remove Good Error = ' + err);
                            }
                        });
                    }
                    
                    for (var j = 0; j < bad.length; j++) {
                        var userId = bad[j];
                        userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'bad' : noticeId } }, function (err, userData) {
                            if (err) {
                                console.log('\n Remove Bad Error = ' + err);
                            }
                        });
                    }

                    data[i].remove(function (err) {
                        if (err) {
                            console.log('\n remove Error = ' + err);
                        }
                    });
                }
            }
        }
    });
}, 1000 * 60);

io.sockets.on('connection', function (socket) {
    
    socket.on('login', function (data) {        // 로그인 요청
        var id = data.userId;
        var pw = data.userPw;
        console.log('\n# id = ' + id);
        console.log('\n# pw = ' + pw);
        
        if (id) {
            if (!pw) {                       // 페이스북, 네이버 로그인
                userModel.findOne({ 'user_id' : id }, function (err, userData) {
                    if (err)
                        console.log('\n# Login Error = ' + err);
                    
                    if (userData == null) {         // 일치하는 아이디가 없다면
                        var user = new userModel({ 'user_id': id, 'image' : null, 'name' : null });     // 아이디 생성
                        user.save(function (err) {
                            if (err) {                  // 오류 발생 시
                                socket.emit('login', { 'code': 305 });      // 에러코드 전송
                                console.log('\n# Login Error');
                            } else {                    // 아이디 생성 성공 시
                                socket.emit('login', { 'code': 200, 'userId': id, 'userName' : null, 'userImage' : null });        // 성공 코드 전송
                                console.log('\n# Login Success');
                            }
                        });
                    } else {                        // 일치하는 아이디가 있다면
                        socket.emit('login', {
                            'code': 200,
                            'user': userData
                        });                // 성공 코드 전송
                        console.log('\n# Login Success'); 
                    }
                });
            } else {                // OneDay 유저라면
                userModel.findOne({ $and : [{ 'user_id' : id }, { 'pw' : pw }] }, function (err, userData) {
                    if (err)
                        console.log('\n# Login Error = ' + err);
                    
                    if (userData == null) {         // 일치하는 아이디,비밀번호가 없다면
                        socket.emit('login', { 'code': 304 });
                        console.log('\n# Login Null');
                    } else {
                        console.log("userData = " + userData);
                        socket.emit('login', {
                            'code': 200,
                            'user': userData
                        });
                        console.log('\n# Login Success');
                    }
                });
            }
        } else {
            socket.emit('login', {
                'code' : 306
            });
            console.log('undefined id');
        }
    });
    
    
    socket.on('setName', function (data) {
        var id = data.userId;
        var name = data.userName;
        console.log('\n setName');
        console.log('\n id = ' + id);
        console.log('\n name = ' + name);
        
        userModel.findOne({ 'name' : name }, function (err, userData) {
            if (userData != null) {                             // 이미 같은 닉네임을 사용 중이라면
                console.log('\n setName name is already use');
                socket.emit('setName', { 'code': 307 });
            } else {
                userModel.findOneAndUpdate({ 'user_id': id }, { 'name' : name }, function (err, userData) {
                    if (err) {
                        console.log('\n setName Error = ' + err);
                        socket.emit('setName', { 'code': 303 , 'userName' : null });
                    } else {
                        console.log('\n setName Success');
                        socket.emit('setName', { 'code': 200 , 'userName' : name });
                    }
                });
            }
        });
    });


    socket.on('setMail', function (data) {
        var id = data.userId;
        var mail = data.userMail;
        console.log('\n setMail');
        console.log('\n id = ' + id);
        console.log('\n mail = ' + mail);
        
        userModel.findOne({ 'mail' : mail }, function (err, userData) {
            if (userData != null) {                             // 이미 같은 닉네임을 사용 중이라면
                console.log('\n setMail mail is already use');
                socket.emit('setMail', { 'code': 307 });
            } else {
                userModel.findOneAndUpdate({ 'user_id': id }, { 'mail' : mail }, function (err, userData) {
                    if (err) {
                        console.log('\n setMail Error = ' + err);
                        socket.emit('setMail', { 'code': 303 , 'mail' : null });
                    } else {
                        console.log('\n setMail Success');
                        socket.emit('setMail', { 'code': 200 , 'mail' : mail });
                    }
                });
            }
        });
    });
    
    
    socket.on('profile', function (data) {
        var id = data.userId;
        console.log('\n getProfile');
        console.log('\n id = ' + id);
        
        userModel.findOne({ 'user_id' : id }, function (err, userData) {
            if (err) {
                console.log('\n find userDB Error = ' + err);
                socket.emit('profile', { 'code' : 341 });
            } else {
                var array = new Array();

                if (!userData) {
                    socket.emit('profile', {
                        'code' : 500
                    });
                    return;
                }
                
                for (var i = 0; i < userData.notice.length; i++) {
                    array.push(userData.notice[i]);
                }
                
                
                for (var i = 0; i < userData.good.length; i++) {
                    array.push(userData.good[i]);
                }
                
                for (var i = 0; i < userData.comment.length; i++) {
                    array.push(userData.comment[i].notice_id);
                }
                
                var noticeList = new Array();
                var length = array.length;
                
                for (var i = 0; i < length; i++) {
                    var noticeId = array.pop();
                    noticeModel.findOne({ 'notice_id' : noticeId }, function (err, noticeData) {
                        if (err) {
                            console.log('\n find Notice DB Error = ' + err);
                            socket.emit('profile', {'code' : 315})
                        } else {
                            noticeList.push(noticeData);
                            
                            if (noticeList.length == length) {
                                socket.emit('profile', { 'code': 200, 'notice': noticeList, 'userId' : id });
                                console.log('\n get profile Success');
                            }
                        }
                    });
                }
            }
        });
    });
    
    
    socket.on('signUp', function (data) {
        console.log(data);
        var name = data.name;
        var id = data.userId;
        var pw = data.userPw;
        var birth = data.userBirth;
        var mail = data.userMail;
        console.log('\n id = ' + id);
        console.log('\n name = ' + name);
        console.log('\n pw = ' + pw);
        console.log('\n birth = ' + birth);
        console.log('\n mail = ' + mail);
        
        userModel.findOne({ 'user_id' : id }, function (err, userData) {
            if (userData != null) {                         // 해당 아이디를 가진 유저가 이미 있다면
                socket.emit('signUp', { code: 300 });
                console.log('\n signUp ID already');
            } else {                                        // 해당 아이디를 가진 유저가 없다면
                var user = new userModel({ 'user_id' : id, 'pw' : pw, 'birth' : birth, 'mail' : mail, 'image' : null, 'name' : name });
                user.save(function (err) {
                    if (err) {                              // 아이디 생성 실패 시
                        socket.emit('signUp', { code: 301 });
                        console.log('\n signUp Fail');
                    } else {                                // 아이디 생성 성공 시
                        socket.emit('signUp', { code: 200 });
                        console.log('\n signUp Success');
                    }
                });
            }
        });
    });
    
    
    socket.on('getAllNotices', function (data) {
        var count = data.count;
        var skip = count * 20;
        var id = data.userId;
        var time = data.time;
        var keyWord = data.keyWord;
        
        console.log('\n count = ' + count);
        console.log('\n keyWord = ' + keyWord);
        console.log('\n userId = ' + id);
        
        if (!id || !time) {
            console.log('데이터 누락\n');
            socket.emit('getAllNotices', {
                'code' : 310
            });
            return;
        }

        noticeModel.count({}, function (err, noticeCount) {
            if (noticeCount < skip) {                       // 요청한 글의 개수보다 db 수가 적다면
                socket.emit('getAllNotices', { 'code' : 309, 'notice' : null, 'userId' : null, 'count' : 0 });
                console.log('\n getAllNotices Not Enough NoticeDB');
                console.log('\n noticeCount = ' + noticeCount);
            } else {
                if (!keyWord) {                // 키워드가 설정 되지 않았다면
                    userModel.findOne({'user_id': id}, function(err, userData) {
                        if (err) {
                            console.log('findUser error = ' + err);
                            socket.emit('getAllNotices', {
                                'code' : 303
                            });
                            return;
                        }
                        if (userData) {
                            noticeModel.find({ $and : [{'date' : {$lt: time}}, {$or : [{'user_id': id}, {'user_id': {$in : userData.friends}}]}]})
                                        .sort({ 'date': -1 }).skip(skip).limit(20).exec(function (err, noticeData) {
                                if (err) {
                                    socket.emit('getAllNotices', { 'code' : 302, 'notice' : null, 'userId' : null, 'count' : 0, 'noticeId' : null });
                                    console.log('\n getAllNotices Err = ' + err);
                                } else {
                                    socket.emit('getAllNotices', { 'code' : 200, 'notice' : noticeData, 'userId' : id, 'count' : count });
                                    console.log('\n getAllNotices Success = ' + JSON.stringify(noticeData));
                                }
                            });
                        }
                    });
                } else {                                        // 키워드가 있다면
                    noticeModel.find({'content' : {$regex : keyWord}}).sort({ 'date': -1 }).skip(skip).limit(20).exec(function (err, noticeData) {
                        if (err) {
                            socket.emit('getAllNotices', { 'code' : 304, 'notice' : null, 'userId' : null, 'count' : 0 });
                            console.log('\n getAllNotices Keyword Err = ' + err);
                        } else {
                            socket.emit('getAllNotices', { 'code' : 200, 'notice' : noticeData, 'userId': id, 'count' : count });
                            console.log('\n getAllNotices Success Keyword');
                        }
                    });
                }
            }
        });
    });
    
    
    socket.on('postNotice', function (data) {                           // 글쓰기
        var id = data.userId;
        var name = data.userName;
        var image = data.image;
        var content = data.content;
        var date = new Date();
        var userImg = data.userImage;
        
        console.log('\n postNotice()');
        console.log('\n id = ' + id);
        console.log('\n name = ' + name);
        console.log('\n content = ' + content);
        console.log('\n date = ' + date);
        var noticeId = new mongoose.Types.ObjectId;
        
        var notice = new noticeModel({ 'content' : content, 'date' : date, 'user_id' : id, 'name' : name, 'notice_id' : noticeId, 'img' : image, 'good.num' : 0, 'bad.num' : 0, 'user_img' : userImg });
        notice.save(function (err) {
            if (err) {                                          // 게시글 저장 실패
                console.log('\n postNotice err = ' + err);
                socket.emit('postNotice', { 'code' : 306 });
            } else {                                            // 게시글 저장 성공
                console.log('\n postNotice Success');
                
                noticeModel.findOne({ $and : [{ 'user_id' : id }, { 'content' : content }, { 'date' : date }] }, function (err, noticeData) {
                    var noticeId = noticeData.notice_id;
                    console.log('\n noticeId = ' + noticeId);
                    
                    userModel.findOneAndUpdate({ 'user_id' : id }, { $push : { 'notice' : noticeId } }, function (err, userData) {
                        if (err) {                          // 사용자 DB에 글 목록 추가 에러 시
                            console.log('\n postNotice add User Notice Err = ' + err);
                            socket.emit('postNotice', { 'code' : 308 });
                        } else {
                            console.log('\n postNotice add User Notice Success');
                            socket.emit('postNotice', { 'code' : 200, 'notice': noticeData });
                        }
                    });
                });
            }
        });
    });


    socket.on('good', function (data) {                                     // 좋아요
        var userId = data.userId;
        var noticeId = data.noticeId;
        var flag = data.flag;
        var position = data.position;

        console.log('\n good');
        console.log('\n userId = ' + userId);
        console.log('\n noticeId = ' + noticeId);
        console.log('\n flag = ' + flag);

        if (flag) {                                             // 좋아요 등록
            noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { $push: { 'good' : userId } }, function (err, noticeData) {
                if (err) {
                    console.log('\n update noticeDB Error = ' + err);
                    socket.emit('good', { 'code' : 310, 'flag' : flag, 'position' : position });
                } else {
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $push : { 'good' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n update userDB Error = ' + err);
                            socket.emit('good', { 'code' : 311, 'flag' : flag, 'position' : position });
                        } else {
                            console.log('\n good Success');
                            socket.emit('good', { 'code' : 200, 'flag' : flag, 'position' : position });
                        }
                    });
                }
            });
        } else {                                                        // 좋아요 취소
            noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { $pull: { 'good' : userId } }, function (err, noticeData) {
                if (err) {
                    console.log('\n update noticeDB Error = ' + err);
                    socket.emit('good', { 'code' : 310, 'flag' : flag, 'position' : position });
                } else {
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'good' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n update userDB Error = ' + err);
                            socket.emit('good', { 'code' : 311, 'flag' : flag, 'position' : position });
                        } else {
                            console.log('\n good Success');
                            socket.emit('good', { 'code' : 200, 'flag' : flag, 'position' : position });
                        }
                    });
                }
            });
        }
    });


    socket.on('bad', function (data) {                                     // 싫어요
        var userId = data.userId;
        var noticeId = data.noticeId;
        var flag = data.flag;
        var position = data.position;


        console.log('\n bad');
        console.log('\n userId = ' + userId);
        console.log('\n noticeId = ' + noticeId);
        console.log('\n flag = ' + flag);

        if (flag) {                                             // 좋아요 등록
            noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { $push: { 'bad' : userId } }, function (err, noticeData) {
                if (err) {
                    console.log('\n update noticeDB Error = ' + err);
                    socket.emit('bad', { 'code' : 310, 'flag' : flag, 'position' : position });
                } else {
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $push : { 'bad' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n update userDB Error = ' + err);
                            socket.emit('bad', { 'code' : 311, 'flag' : flag, 'position' : position });
                        } else {
                            console.log('\n good Success');
                            socket.emit('bad', { 'code' : 200, 'flag' : flag, 'position' : position });
                        }
                    });
                }
            });
        } else {                                                        // 좋아요 취소
            noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { $pull: { 'bad' : userId } }, function (err, noticeData) {
                if (err) {
                    console.log('\n update noticeDB Error = ' + err);
                    socket.emit('bad', { 'code' : 310, 'flag' : flag, 'position' : position });
                } else {
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'bad' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n update userDB Error = ' + err);
                            socket.emit('bad', { 'code' : 311, 'flag' : flag, 'position' : position });
                        } else {
                            console.log('\n good Success');
                            socket.emit('bad', { 'code' : 200, 'flag' : flag, 'position' : position });
                        }
                    });
                }
            });
        }
    });


    socket.on('insertComment', function (data) {
        var id = data.userId;
        var noticeId = data.noticeId;
        var comment = data.comment;
        var name = data.userName;
        var position = data.position;
        var date = new Date();

        console.log('\n comment');
        console.log('\n userId = ' + id);
        console.log('\n userName = ' + name);
        console.log('\n noticeId = ' + noticeId);
        console.log('\n comment = ' + comment);

        userModel.findOneAndUpdate({ 'user_id' : id }, { $push: { 'comment' : { 'notice_id' : noticeId, 'content' : comment } } }, function (err, userData) {
            if (err) {
                console.log('\n comment Update User DB Error = ' + err);
                socket.emit('insertComment', { 'code' : 312, 'comment' : comment, 'position' : position, 'noticeId' : noticeId });
            } else {
                noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { $push : { 'comment' : { 'user_id' : id, 'user_image' : userData.image, 'content' : comment, 'name' : name, 'date' : date } } }, function (err, noticeData) {
                    if (err) {
                        console.log('\n insertComment Update Notice DB Error = ' + err);
                        socket.emit('insertComment', { 'code' : 313, 'comment' : comment, 'position' : position, 'noticeId' : noticeId });
                    } else {
                        console.log('\n insertComment Success');
                        socket.emit('insertComment', { 'code' : 200, 'comment' : comment, 'position' : position, 'noticeId' : noticeId });
                    }
                });
            }
        });
    });


    socket.on('setImage', function (data) {
        var id = data.userId;
        var image = data.userImage;
        
        console.log('\n setImage');
        console.log('\n id = ' + id);

        userModel.findOneAndUpdate({ 'user_id' : id }, { 'image' : image }, function (err, userData) {
            if (err) {
                console.log('\n update User DB Error = ' + err);
                socket.emit('setImage', { 'code' : 316 });
            } else {
                var noticeList = userData.notice;
                var commentList = userData.comment;

                // 글
                for (var i = 0; i < noticeList.length; i++) {
                    noticeModel.findOneAndUpdate({ 'notice_id' : noticeList[i] }, { 'user_img' : image }, function (err, noticeData) {
                        if (err) {
                            console.log('\n Update Notice DB Error = ' + err);
                            socket.emit('setImage', { 'code' : 317 });
                        }
                    });
                }

                // 댓글
                for (var i = 0; i < commentList.length; i++) {
                    noticeModel.findOne({ 'notice_id' : commentList[i].notice_id }, function (err, noticeData) {
                        if (err) {
                            console.log('\n Update Notice DB Error = ' + err);
                            socket.emit('setImage', { 'code' : 317 });
                        } else {
                            var noticeCommentList = noticeData.comment;
                            for (var j = 0; j < noticeCommentList.length; j++) {
                                if (noticeCommentList[j].user_id == id) {
                                    noticeData.comment[j].user_img = image;
                                    console.log('user_id ' + noticeCommentList[j].user_id);
                                    console.log('comment ' + noticeCommentList[j].content);
                                }

                                if (noticeCommentList.length - 1 == j) {
                                    noticeData.save(function (err) {
                                        if (err) {
                                            console.log('\n Update Notice DB Error = ' + err);
                                            socket.emit('setImage', { 'code' : 317 });
                                        } else {
                                            console.log('\n change success');
                                            socket.emit('setImage', { 'code' : 200 });
                                        }
                                    });
                                }
                            }
                        }
                    });
                }
            }
        });
    });

    socket.on('signOut', function (data) {
        var id = data.userId;
        console.log('\n signOut');
        console.log('\n userId = ' + id);

        userModel.findOneAndRemove({ 'user_id' : id }, function (err, userData) {
            if (err) {
                console.log('\n Remove User DB ERROR = ' + err);
                socket.emit('signOut', { 'code' : 318 });
            } else {
                console.log('\n Remove User DB SUCCESS');
                socket.emit('signOut', { 'code' : 200 });
            }
        });
    });


    socket.on('findId', function (data) {
        var mail = data.userMail;
        
        console.log('\n findId');
        console.log('\n mail = ' + mail);
        
        userModel.findOne({ 'mail' : mail }, function (err, userData) {
            if (err) {
                console.log('\n find User DB Error = ' + err);
                socket.emit('findId', { 'code' : 319 });
            } else {
                console.log('userData = ' + userData);
                if (userData == null | typeof userData === 'undefined') {
                    console.log('\n find User DB Null');
                    socket.emit('findId', { 'code' : 321 });
                } else {
                    console.log('\n find User DB Success');
                    socket.emit('findId', { 'code' : 200, 'userId' : userData.user_id });
                }
            }
        });
    });


    socket.on('findPw', function (data) {
        var id = data.userId;
        var mail = data.userMail;
        
        console.log('\n findPw');
        console.log('\n userId = ' + id);
        console.log('\n mail = ' + mail);
        
        userModel.findOne({ $and : [{ 'mail' : mail }, { 'user_id' : id }] }, function (err, userData) {
            if (err) {
                console.log('\n find User DB Error = ' + err);
                socket.emit('findPw', { 'code' : 320 });
            } else {
                if (userData == null | typeof userData === 'undefined') {
                    console.log('\n find User DB Null');
                    socket.emit('findPw', { 'code' : 322 });
                } else {
                    console.log('\n find User DB Success');
                    socket.emit('findPw', { 'code' : 200 });
                }
            }
        });
    });


    socket.on('setPw', function (data) {
        var id = data.userId;
        var pw = data.userPw;

        console.log('\n setPw');
        console.log('\n id = ' + id);
        console.log('\n pw = ' + pw);

        userModel.findOneAndUpdate({ 'user_id' : id }, { 'pw' : pw }, function (err, userData) {
            if (err) {
                console.log('\n find User DB Error = ' + err);
                socket.emit('findPw', { 'code' : 323 });
            } else {
                console.log('\n find User DB Success');
                socket.emit('findPw', { 'code' : 200 });
            }
        })
    });


    socket.on('updateNotice', function (data) {
        var content = data.content;
        var noticeId = data.noticeId;
        
        console.log('\n updateNotice');
        console.log('\n content = ' + content);
        console.log('\n noticeId = ' + noticeId);
        
        noticeModel.findOneAndUpdate({ 'notice_id' : noticeId }, { 'content' : content, 'img' : [] }, function (err, noticeData) {
            if (err) {
                console.log('\n Update Notice Error = ' + err);
                socket.emit('updateNotice', { 'code' : 324 });
            } else {
                console.log('\n Update Notice Success');
                socket.emit('updateNotice', { 'code' : 200 });
            }
        });
    });


    socket.on('getUsers', function(data) {
        var keyword = data.keyword

        console.log('getUsers = ' + keyword);

        if (!keyword) {
            console.log('data 누락 ');
            socket.emit('getUsers', {
                'code' : 500
            });
        } else {
            userModel.find({
                $or : [
                    {'user_id' : { $regex : keyword}},
                    {'name' : { $regex : keyword }}
                ]
            }, function(err, userData) {
                if (err) {
                    console.log('getUsers error = ' + err);
                    socket.emit('getUsers', {
                        'code' : 501
                    });
                } else {
                    socket.emit('getUsers', {
                        'code' : 200,
                        'user' : userData
                    });
                }
            });
        }
    });


    socket.on('getFriendProfile', function(data) {
        var users = data.users;
        var friends = [];
        for (var i = 0; i < users.length; i++) {
            userModel.findOne({'user_id' : users[i]}, function(err, userData) {
                if (err) {
                    console.log('user 찾기 에러');
                    socket.emit('getFriendProfile', {
                        'code' : 500
                    });
                    return;
                }

                friends.push(userData);
            });
        }
        socket.emit('getFriendProfile', {
            'code' : 200,
            'friends' : friends
        });
    })


    socket.on('removeNotice', function (data) {
        var noticeId = data.noticeId;
        
        console.log('\n removeNotice');
        console.log('\n noticeId = ' + noticeId);
        
        noticeModel.findOneAndRemove({ 'notice_id' : noticeId }, function (err, noticeData) {
            if (err) {
                console.log('\n Remove Notice Error = ' + err);
                socket.emit('removeNotice', { 'code' : 325 });
            } else {
                var good = noticeData.good;
                var bad = noticeData.bad;
                var goodNum = good.length;
                var badNum = bad.length;
                var noticeId = noticeData.notice_id;
                var comment = noticeData.comment;
                var user = noticeData.user_id;
                console.log('noticeId = ' + noticeId);
                console.log('comment = ' + comment);
                console.log('user = ' + user);
                
                
                userModel.findOneAndUpdate({ 'user_id' : user }, { $pull : { 'notice' : noticeId } }, function (err, userData) {
                    if (err) {
                        console.log('\n Remove Notice Error = ' + err);
                    } else {
                        console.log('\n Remove Notice Success');
                    }
                });
                
                
                for (var j = 0; j < comment.length; j++) {
                    var userId = comment[j].user_id;
                    console.log('\n comment userId = ' + userId);
                    userModel.findOne({ 'user_id' : userId }, function (err, userData) {
                        if (err) {
                            console.log('\n Remove Comment Error = ' + err);
                        } else {
                            var commentList = userData.comment;
                            console.log('commentList = ' + commentList);
                            
                            for (var k = 0; k < commentList.length; k++) {
                                var commentNotice = commentList[k];
                                
                                if (commentNotice.notice_id.equals(noticeId)) {
                                    console.log('\n Equal');
                                    commentList.splice(k, 1);
                                    k--;
                                }
                                
                                console.log('k = ' + k);
                                console.log('length = ' + commentList.length);
                                
                                if (k == commentList.length - 1) {
                                    console.log('\n end');
                                    userData.comment = commentList;
                                    userData.save(function (err) {
                                        if (err) {
                                            console.log('\n Remove Comment Error2 = ' + err);
                                        } else {
                                            console.log('\n Remove Comment Success');
                                        }
                                    });
                                }
                            }
                        }
                    });
                }
                
                for (var j = 0; j < good.length; j++) {
                    var userId = good[j];
                    console.log('\n good userId = ' + userId);
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'good' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n Remove Good Error = ' + err);
                        } else {
                            console.log('\n Remove Good Success');
                        }
                    });
                }
                
                for (var j = 0; j < bad.length; j++) {
                    var userId = bad[j];
                    userModel.findOneAndUpdate({ 'user_id' : userId }, { $pull : { 'bad' : noticeId } }, function (err, userData) {
                        if (err) {
                            console.log('\n Remove Bad Error = ' + err);
                        } else {
                            console.log('\n Remove Bad Success');
                        }
                    });
                }

                console.log('\n Remove Notice Success');
                socket.emit('removeNotice', { 'code' : 200 });
            }
        });
    });
});