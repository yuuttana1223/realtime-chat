/* jshint curly:true, debug:true */
/* globals $, firebase, moment */

// プロフィール画像を設定していないユーザのデフォルト画像
const defaultProfileImageURL = "img/default-profile-image.png";

// 初期ルーム名
const defaultRoomName = "default";

// 現在表示しているルーム名
let currentRoomName = null;

// 現在ログインしているユーザID
let currentUID;

// Firebaseから取得したデータを一時保存しておくための変数
let dbdata = {};

/**
 * ----------------------
 * ユーティリティ（便利な関数）
 * ----------------------
 */

// DateオブジェクトをHTMLにフォーマットして返す
const formatDate = (date) => {
  const m = moment(date);
  return `${m.format("YYYY/MM/DD")}&nbsp;&nbsp;${m.format("HH:mm:ss")}`;
};

/**
 * --------------------
 * ユーザ情報設定関連の関数
 * --------------------
 */

// settingsModalを初期状態に戻す
const resetSettingsModal = () => {
  $("#settings-form")[0].reset();
};

// ニックネーム表示を更新する
const updateNicknameDisplay = (uid) => {
  const user = dbdata.users[uid];
  if (user) {
    $(`.nickname-${uid}`).text(user.nickname);
    if (uid === currentUID) {
      $("#menu-profile-name").text(user.nickname);
    }
  }
};

// プロフィール画像の表示を更新する
const updateProfileImageDisplay = (uid, url) => {
  $(`.profile-image-${uid}`).attr({
    src: url,
  });
  if (uid === currentUID) {
    $("#menu-profile-image").attr({
      src: url,
    });
  }
};

// プロフィール画像をダウンロードして表示する
const downloadProfileImage = (uid) => {
  const user = dbdata.users[uid];
  if (!user) {
    return;
  }
  if (user.profileImageLocation) {
    // profile-images/abcdef のようなパスから画像のダウンロードURLを取得
    firebase
      .storage()
      .ref(user.profileImageLocation)
      .getDownloadURL()
      .then((url) => {
        // 画像URL取得成功
        user.profileImageURL = url;
        updateProfileImageDisplay(uid, url);
      })
      .catch((error) => {
        console.error("写真のダウンロードに失敗:", error);
        user.profileImageURL = defaultProfileImageURL;
        updateProfileImageDisplay(uid, defaultProfileImageURL);
      });
  } else {
    // プロフィール画像が未設定の場合
    user.profileImageURL = defaultProfileImageURL;
    updateProfileImageDisplay(uid, defaultProfileImageURL);
  }
};

/**
 * -------------------
 * チャット画面関連の関数
 * -------------------
 */

// messageの表示用のdiv（jQueryオブジェクト）を作って返す
const createMessageDiv = (messageId, message) => {
  // HTML内のテンプレートからコピーを作成
  let divTag = null;
  if (message.uid === currentUID) {
    // 送信メッセージ
    divTag = $(".message-template .message--sent").clone();
  } else {
    // 受信メッセージ
    divTag = $(".message-template .message--received").clone();
  }

  const user = dbdata.users[message.uid];

  // ユーザが存在する場合
  if (user) {
    // 投稿者ニックネーム
    divTag
      .find(".message__user-name")
      .addClass(`nickname-${message.uid}`)
      .text(user.nickname);
    // 投稿者プロフィール画像
    divTag
      .find(".message__user-image")
      .addClass(`profile-image-${message.uid}`);
    if (user.profileImageURL) {
      // プロフィール画像のURLを取得済みの場合
      divTag.find(".message__user-image").attr({
        src: user.profileImageURL,
      });
    }
  }
  // メッセージ本文
  divTag.find(".message__text").text(message.text);
  // 投稿日
  divTag.find(".message__time").html(formatDate(new Date(message.time)));

  // id属性をセット
  divTag.attr("id", `message-id-${messageId}`);

  return divTag;
};

// messageを表示する
const addMessage = (messageId, message) => {
  const divTag = createMessageDiv(messageId, message);
  divTag.appendTo("#message-list");

  // 一番下までスクロール
  $("html, body").scrollTop($(document).height());
};

// 動的に追加されたルームを一旦削除する
const clearRoomList = () => {
  $("#room-list").find(".room-list-dynamic").remove();
};

// ナビゲーションバーの情報を消去
const clearNavbar = () => {
  $(".room-list-menu").text("ルーム");
  $("#menu-profile-name").text("");
  $("#menu-profile-image").attr({
    src: defaultProfileImageURL,
  });
  clearRoomList();
};

// ルーム一覧をナビゲーションメニュー内に表示する
const showRoomList = (roomsSnapshot) => {
  // 動的に追加されたルームを一旦削除する
  clearRoomList();

  roomsSnapshot.forEach((roomSnapshot) => {
    const roomName = roomSnapshot.key;
    const roomListLink = $("<a>", {
      href: `#${roomName}`,
      class: "dropdown-item room-list__link room-list-dynamic",
    }).text(roomName);
    roomListLink.on("click", () => {
      // ハンバーガーメニューが開いている場合は閉じる
      $("#navbarSupportedContent").collapse("hide");
    });
    $("#room-list").append(roomListLink);
  });
};

// 表示されているメッセージを消去
const clearMessages = () => {
  $("#message-list").empty();
};

// チャットビュー内のユーザ情報をクリア
const resetChatView = () => {
  // メッセージ一覧を消去
  clearMessages();

  // ナビゲーションバーの情報を消去
  clearNavbar();

  // ユーザ情報設定モーダルのプレビュー画像を消去
  $("#settings-profile-image-preview").attr({
    src: defaultProfileImageURL,
  });
};

/**
 * ルームを表示する。window.location.hashを変更することで
 * onhashchangeが呼ばれ、そこからshowRoom()が呼ばれる。
 */
const changeLocationHash = (roomName) => {
  window.location.hash = encodeURIComponent(roomName);
};

// ルームを実際に表示する
const showRoom = (roomName) => {
  if (!dbdata.rooms || !dbdata.rooms[roomName]) {
    console.error("該当するルームがありません:", roomName);
    return;
  }
  currentRoomName = roomName;
  clearMessages();

  // ルームのメッセージ一覧をダウンロードし、かつメッセージの追加を監視
  const roomRef = firebase.database().ref(`messages/${roomName}`);

  // 過去に登録したイベントハンドラを削除
  roomRef.off("child_added");

  // イベントハンドラを登録
  roomRef.on("child_added", (childSnapshot) => {
    if (roomName === currentRoomName) {
      // 追加されたメッセージを表示
      addMessage(childSnapshot.key, childSnapshot.val());
    }
  });

  // ナビゲーションバーのルーム表示を更新
  $(".room-list-menu").text(`ルーム: ${roomName}`);

  // 初期ルームの場合はルーム削除メニューを無効にする
  if (roomName === defaultRoomName) {
    $("#delete-room-menuitem").addClass("disabled");
  } else {
    $("#delete-room-menuitem").removeClass("disabled");
  }

  // ナビゲーションのドロップダウンメニューで現在のルームをハイライトする
  $("#room-list > a").removeClass("active");
  $(`.room-list__link[href='#${roomName}']`).addClass("active");
};

// チャット画面表示用のデータが揃った時に呼ばれる
const showCurrentRoom = () => {
  if (currentRoomName) {
    if (!dbdata.rooms[currentRoomName]) {
      // 現在いるルームが削除されたため初期ルームに移動
      changeLocationHash(defaultRoomName);
    }
  } else {
    // ページロード直後の場合
    const { hash } = window.location;
    if (hash) {
      // URLの#以降がある場合はそのルームを表示
      const roomName = decodeURIComponent(hash.substring(1));
      if (dbdata.rooms[roomName]) {
        showRoom(roomName);
      } else {
        // ルームが存在しないので初期ルームを表示
        changeLocationHash(defaultRoomName);
      }
    } else {
      // #指定がないので初期ルームを表示
      changeLocationHash(defaultRoomName);
    }
  }
};

// #message-listの高さを調整する。主にMobile Safari向け。
const setMessageListMinHeight = () => {
  $("#message-list").css({
    // $(window).height() (ブラウザウインドウの高さ)
    // - 51 (ナビゲーションバーの高さ)
    // - 46 (投稿フォームの高さ)
    // + 6 (投稿フォームのborder-radius)
    "min-height": `${$(window).height() - 51 - 46 + 6}px`,
  });
};

// ルーム作成モーダルの内容をリセットする
const resetCreateRoomModal = () => {
  $("#create-room-form")[0].reset();
  $("#create-room__room-name").removeClass("has-error");
  $("#create-room__help").hide();
};

/**
 * ルームを削除する
 * なおルームが削除されると roomsRef.on("value", ...); のコールバックが実行され、初期ルームに移動する
 */
const deleteRoom = (roomName) => {
  // 初期ルームは削除不可
  if (roomName === defaultRoomName) {
    throw new Error(`${defaultRoomName}ルームは削除できません`);
  }

  // TODO: ルームを削除

  // TODO: ルーム内のメッセージも削除
};

// チャット画面の初期化処理
const loadChatView = () => {
  resetChatView();

  dbdata = {}; // キャッシュデータを空にする

  // ユーザ一覧を取得してさらに変更を監視
  const usersRef = firebase.database().ref("users");
  // 過去に登録したイベントハンドラを削除
  usersRef.off("value");
  // イベントハンドラを登録
  usersRef.on("value", (usersSnapshot) => {
    // usersに変更があるとこの中が実行される

    dbdata.users = usersSnapshot.val();

    // 自分のユーザデータが存在しない場合は作成
    if (dbdata.users === null || !dbdata.users[currentUID]) {
      const { currentUser } = firebase.auth();
      if (currentUser) {
        console.log("ユーザデータを作成します");
        firebase.database().ref(`users/${currentUID}`).set({
          nickname: currentUser.email,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP,
        });

        // このコールバック関数が再度呼ばれるのでこれ以上は処理しない
        return;
      }
    }

    Object.keys(dbdata.users).forEach((uid) => {
      updateNicknameDisplay(uid);
      downloadProfileImage(uid);
    });

    // usersとroomsが揃ったらルームを表示（初回のみ）
    if (currentRoomName === null && dbdata.rooms) {
      showCurrentRoom();
    }
  });

  // ルーム一覧を取得してさらに変更を監視
  const roomsRef = firebase.database().ref("rooms");

  // 過去に登録したイベントハンドラを削除
  roomsRef.off("value");

  // コールバックを登録
  roomsRef.on("value", (roomsSnapshot) => {
    // roomsに変更があるとこの中が実行される

    dbdata.rooms = roomsSnapshot.val();

    // 初期ルームが存在しない場合は作成する
    if (dbdata.rooms === null || !dbdata.rooms[defaultRoomName]) {
      console.log(`${defaultRoomName}ルームを作成します`);
      firebase.database().ref(`rooms/${defaultRoomName}`).setWithPriority(
        {
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdByUID: currentUID,
        },
        1
      );

      // このコールバック関数が再度呼ばれるのでこれ以上は処理しない
      return;
    }

    // ルーム一覧をナビゲーションメニューに表示
    showRoomList(roomsSnapshot);

    // usersデータがまだ来ていない場合は何もしない
    if (!dbdata.users) {
      return;
    }

    showCurrentRoom();
  });
};

/**
 * ----------------------
 * すべての画面共通で使う関数
 * ----------------------
 */

// ビュー（画面）を変更する
const showView = (id) => {
  $(".view").hide();
  $(`#${id}`).fadeIn();

  if (id === "chat") {
    loadChatView();
  }
};

/**
 * -------------------------
 * ログイン・ログアウト関連の関数
 * -------------------------
 */

// ログインフォームを初期状態に戻す
const resetLoginForm = () => {
  $("#login-form > .form-group").removeClass("has-error");
  $("#login__help").hide();
  $("#login__submit-button").prop("disabled", false).text("ログイン");
};

// ログインした直後に呼ばれる
const onLogin = () => {
  console.log("ログイン完了");

  // チャット画面を表示
  showView("chat");
};

// ログアウトした直後に呼ばれる
const onLogout = () => {
  firebase.database().ref("users").off("value");
  firebase.database().ref("rooms").off("value");
  currentRoomName = null;
  dbdata = {};
  resetLoginForm();
  resetChatView();
  resetSettingsModal();
  showView("login");
};

// ユーザ作成のときパスワードが弱すぎる場合に呼ばれる
const onWeakPassword = () => {
  resetLoginForm();
  $("#login__password").addClass("has-error");
  $("#login__help").text("6文字以上のパスワードを入力してください").fadeIn();
};

// ログインのときパスワードが間違っている場合に呼ばれる
const onWrongPassword = () => {
  resetLoginForm();
  $("#login__password").addClass("has-error");
  $("#login__help").text("正しいパスワードを入力してください").fadeIn();
};

// ログインのとき試行回数が多すぎてブロックされている場合に呼ばれる
const onTooManyRequests = () => {
  resetLoginForm();
  $("#login__submit-button").prop("disabled", true);
  $("#login__help")
    .text("試行回数が多すぎます。後ほどお試しください。")
    .fadeIn();
};

// ログインのときメールアドレスの形式が正しくない場合に呼ばれる
const onInvalidEmail = () => {
  resetLoginForm();
  $("#login__email").addClass("has-error");
  $("#login__help").text("メールアドレスを正しく入力してください").fadeIn();
};

// その他のログインエラーの場合に呼ばれる
const onOtherLoginError = () => {
  resetLoginForm();
  $("#login__help").text("ログインに失敗しました").fadeIn();
};

/**
 * ---------------------------------------
 * 以下、コールバックやイベントハンドラの登録と、
 * ページ読み込みが完了したタイミングで行うDOM操作
 * ---------------------------------------
 */

/**
 * --------------------
 * ログイン・ログアウト関連
 * --------------------
 */

// ユーザ作成に失敗したことをユーザに通知する
const catchErrorOnCreateUser = (error) => {
  // 作成失敗
  console.error("ユーザ作成に失敗:", error);
  if (error.code === "auth/weak-password") {
    onWeakPassword();
  } else {
    // その他のエラー
    onOtherLoginError(error);
  }
};

// ログインに失敗したことをユーザーに通知する
const catchErrorOnSignIn = (error) => {
  if (error.code === "auth/wrong-password") {
    // パスワードの間違い
    onWrongPassword();
  } else if (error.code === "auth/too-many-requests") {
    // 試行回数多すぎてブロック中
    onTooManyRequests();
  } else if (error.code === "auth/invalid-email") {
    // メールアドレスの形式がおかしい
    onInvalidEmail();
  } else {
    // その他のエラー
    onOtherLoginError(error);
  }
};

// ログイン状態の変化を監視する
firebase.auth().onAuthStateChanged((user) => {
  // ログイン状態が変化した

  if (user) {
    // ログイン済
    currentUID = user.uid;
    onLogin();
  } else {
    // 未ログイン
    currentUID = null;
    onLogout();
  }
});

// ログインフォームが送信されたらログインする
$("#login-form").on("submit", (e) => {
  e.preventDefault();

  // フォームを初期状態に戻す
  resetLoginForm();

  // ログインボタンを押せないようにする
  $("#login__submit-button").prop("disabled", true).text("送信中…");

  const email = $("#login-email").val();
  const password = $("#login-password").val();

  // TODO: ログインを試みて該当ユーザが存在しない場合は新規作成する
});

// ログアウトがクリックされたらログアウトする
$("#logout__link").on("click", (e) => {
  e.preventDefault();

  // ハンバーガーメニューが開いている場合は閉じる
  $("#navbarSupportedContent").collapse("hide");

  firebase
    .auth()
    .signOut()
    .then(() => {
      // ログアウト成功
      window.location.hash = "";
    })
    .catch((error) => {
      console.error("ログアウトに失敗:", error);
    });
});

/**
 * --------------
 * チャット画面関連
 * --------------
 */

$("#comment-form").on("submit", (e) => {
  const commentForm = $("#comment-form__text");
  const comment = commentForm.val();

  e.preventDefault();

  if (comment === "") {
    return;
  }
  commentForm.val("");

  // TODO: メッセージを投稿する
});

// #message-listの高さを調整
setMessageListMinHeight();

/**
 * ------------
 * ルーム作成関連
 * ------------
 */

$("#createRoomModal").on("show.bs.modal", () => {
  // #createRoomModalが表示される直前に実行する処理

  // モーダルの内容をリセット
  resetCreateRoomModal();
});
$("#createRoomModal").on("shown.bs.modal", () => {
  // #createRoomModalが表示された直後に実行する処理

  // ハンバーガーメニューが開いている場合は閉じる
  $("#navbarSupportedContent").collapse("hide");

  // ルーム名の欄にすぐ入力できる状態にする
  $("#room-name").trigger("focus");
});

// ルーム作成フォームが送信されたらルームを作成
$("#create-room-form").on("submit", (e) => {
  const roomName = $("#room-name").val().trim(); // 頭とお尻の空白文字を除去
  $("#room-name").val(roomName);

  e.preventDefault();

  // Firebaseのキーとして使えない文字が含まれているかチェック
  if (/[.$#[\]/]/.test(roomName)) {
    $("#create-room__help")
      .text("ルーム名に次の文字は使えません: . $ # [ ] /")
      .fadeIn();
    $("#create-room__room-name").addClass("has-error");
    return;
  }

  if (roomName.length < 1 || roomName.length > 20) {
    $("#create-room__help")
      .text("1文字以上20文字以内で入力してください")
      .fadeIn();
    $("#create-room__room-name").addClass("has-error");
    return;
  }

  if (dbdata.rooms[roomName]) {
    $("#create-room__help").text("同じ名前のルームがすでに存在します").fadeIn();
    $("#create-room__room-name").addClass("has-error");
  }

  // TODO (A): ルーム作成処理

  /**
   * TODO (B): ルーム作成に成功した場合は下記2つの処理を実行する
   *
   * モーダルを非表示にする
   * $("#createRoomModal").modal("toggle");
   *
   * 作成したルームを表示
   * changeLocationHash(roomName);
   */
});

/**
 * ------------
 * ルーム削除関連
 * ------------
 */

$("#deleteRoomModal").on("show.bs.modal", (e) => {
  // ルーム削除のモーダル表示直前に実行する処理

  if (!currentRoomName) {
    e.preventDefault();
  }

  // 初期ルームは削除不可のためモーダルを表示しない
  if (currentRoomName === defaultRoomName) {
    e.preventDefault();
  }

  // モーダルの内容をリセット
  $("#delete-room__name").text(currentRoomName);

  // ハンバーガーメニューが開いている場合は閉じる
  $("#navbarSupportedContent").collapse("hide");
});

// ルーム削除ボタンクリックでルームを削除する
$("#delete-room__button").on("click", () => {
  deleteRoom(currentRoomName);
  $("#deleteRoomModal").modal("toggle");
});

/**
 * ---------------
 * ユーザ情報設定関連
 * ---------------
 */

$("#settingsModal").on("show.bs.modal", (e) => {
  // #settingsModalが表示される直前に実行する処理

  if (!dbdata.users) {
    e.preventDefault();
  }

  // ハンバーガーメニューが開いている場合は閉じる
  $("#navbarSupportedContent").collapse("hide");

  // ニックネームの欄に現在の値を入れる
  $("#settings-nickname").val(dbdata.users[currentUID].nickname);

  const user = dbdata.users[currentUID];
  if (user.profileImageURL) {
    // プロフィール画像のURLをすでに取得済
    $("#settings-profile-image-preview").attr({
      src: user.profileImageURL,
    });
  } else if (user.profileImageLocation) {
    // プロフィール画像は設定されているがURLは未取得
    firebase
      .storage()
      .ref(`profile-images/${currentUID}`)
      .getDownloadURL()
      .then((url) => {
        $("#settings-profile-image-preview").attr({
          src: url,
        });
      });
  }
});

// ニックネーム欄の値が変更されたらデータベースに保存する
$("#settings-nickname").on("change", (e) => {
  const newName = $(e.target).val();
  if (newName.length === 0) {
    // 入力されていない場合は何もしない
    return;
  }
  firebase.database().ref(`users/${currentUID}`).update({
    nickname: newName,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  });
});

// プロフィール画像のファイルが指定されたらアップロードする
$("#settings-profile-image").on("change", (e) => {
  const input = e.target;
  const { files } = input;
  if (files.length === 0) {
    // ファイルが選択されていない場合
    return;
  }

  const file = files[0];
  const metadata = {
    contentType: file.type,
  };

  // ローディング表示
  $("#settings-profile-image-preview").hide();
  $("#settings-profile-image-loading-container").css({
    display: "inline-block",
  });

  // ファイルアップロードを開始
  firebase
    .storage()
    .ref(`profile-images/${currentUID}`)
    .put(file, metadata)
    .then(() => {
      // アップロード成功したら画像表示用のURLを取得
      firebase
        .storage()
        .ref(`profile-images/${currentUID}`)
        .getDownloadURL()
        .then((url) => {
          // 画像のロードが終わったらローディング表示を消して画像を表示
          $("#settings-profile-image-preview").on("load", (evt) => {
            $("#settings-profile-image-loading-container").css({
              display: "none",
            });
            $(evt.target).show();
          });
          $("#settings-profile-image-preview").attr({
            src: url,
          });

          // ユーザ情報を更新
          firebase
            .database()
            .ref(`users/${currentUID}`)
            .update({
              profileImageLocation: `profile-images/${currentUID}`,
              updatedAt: firebase.database.ServerValue.TIMESTAMP,
            });
        });
    })
    .catch((error) => {
      console.error("プロフィール画像のアップロードに失敗:", error);
    });
});

// プロフィール画像のファイルが指定されたら、そのファイル名を表示する
$("#settings-profile-image").on("change", (e) => {
  const input = e.target;
  const $label = $("#settings-profile-image-label");
  const file = input.files[0];

  if (file != null) {
    $label.text(file.name);
  } else {
    $label.text("ファイルを選択");
  }
});

// ユーザ情報設定フォームが送信されてもページ遷移しない
$("#settings-form").on("submit", (e) => {
  e.preventDefault();
});

// URLの#以降が変化したらそのルームを表示する
$(window).on("hashchange", () => {
  if (window.location.hash.length > 1) {
    showRoom(decodeURIComponent(window.location.hash.substring(1)));
  }
});

// ウインドウがリサイズされたら#message-listの高さを再調整
$(window).on("resize", setMessageListMinHeight);
